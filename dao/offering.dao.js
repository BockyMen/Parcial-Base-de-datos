const db = require("../services/firebase.service");
const pool = require("../services/mysql.service");

const OFFERING_COLLECTION = "oferta";
const PERIOD_PATTERN = /^\d{4}-(I|II)$/;

const GROUP_QUERY = `
  SELECT g.id AS groupId, g.period, g.group_number AS groupNumber, g.capacity,
         s.name AS subjectName, d.name AS departmentName, p.name AS professorName
  FROM course_group g
  JOIN subject s ON s.id = g.subject_id
  JOIN department d ON d.id = s.department_id
  JOIN professor p ON p.id = g.professor_id`;

function validatePeriod(period) {
  if (!PERIOD_PATTERN.test(period)) {
    return "El periodo debe tener el formato 2026-II";
  }
  return null;
}

function validateOfferingFilters(department, period) {
  if (!department) {
    return "La dependencia es obligatoria";
  }
  return validatePeriod(period);
}

function validateEnrollment(groupId, studentCode) {
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return "El id del grupo debe ser un número entero positivo";
  }
  if (!studentCode) {
    return "El código del estudiante es obligatorio";
  }
  return null;
}

function buildOffering(group, enrolled) {
  return {
    id: `${group.period}_${group.groupId}`,
    groupId: group.groupId,
    period: group.period,
    subjectName: group.subjectName,
    departmentName: group.departmentName,
    groupNumber: group.groupNumber,
    professorName: group.professorName,
    capacity: group.capacity,
    enrolled,
  };
}

function findEnrollmentBlocker(group, student, enrollments, studentCode) {
  if (!group) {
    return { status: 404, error: "El grupo no existe" };
  }
  if (!student) {
    return { status: 404, error: "El estudiante no existe" };
  }
  if (enrollments.length >= group.capacity) {
    return { status: 409, error: "El grupo está lleno" };
  }
  if (enrollments.some((e) => e.studentCode === studentCode)) {
    return { status: 409, error: "El estudiante ya está inscrito en este grupo" };
  }
  return null;
}

async function writeOfferings(offerings) {
  const batch = db.batch();
  offerings.forEach((offering) => {
    batch.set(db.collection(OFFERING_COLLECTION).doc(offering.id), offering);
  });
  await batch.commit();
}

exports.syncOffering = async (req, res) => {
  try {
    const period = String(req.params.periodo).trim();
    const error = validatePeriod(period);
    if (error) return res.status(400).json({ error });
    const [groups] = await pool.query(`${GROUP_QUERY} WHERE g.period = ? ORDER BY g.id`, [period]);
    if (groups.length === 0) {
      return res.status(404).json({ error: `No hay grupos en el periodo ${period}` });
    }
    const [enrollments] = await pool.query(
      `SELECT e.group_id AS groupId
       FROM enrollment e
       JOIN course_group g ON g.id = e.group_id
       WHERE g.period = ?`,
      [period]
    );
    const offerings = groups.map((group) => {
      const enrolled = enrollments.filter((e) => e.groupId === group.groupId).length;
      return buildOffering(group, enrolled);
    });
    await writeOfferings(offerings);

    res.json({ ok: true, synced: offerings.length, period });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getOffering = async (req, res) => {
  try {
    const department = String(req.query.department ?? "").trim();
    const period = String(req.query.period ?? "").trim();
    const error = validateOfferingFilters(department, period);
    if (error) return res.status(400).json({ error });

    const snapshot = await db
      .collection(OFFERING_COLLECTION)
      .where("departmentName", "==", department)
      .where("period", "==", period)
      .get();

    res.json(snapshot.docs.map((doc) => doc.data()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.createEnrollment = async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const studentCode = String(req.body?.studentCode ?? "").trim();
    const error = validateEnrollment(groupId, studentCode);
    if (error) return res.status(400).json({ error });

    const [groups] = await pool.query(`${GROUP_QUERY} WHERE g.id = ? LIMIT 1`, [groupId]);
    const [students] = await pool.query(
      "SELECT code FROM student WHERE code = ? LIMIT 1",
      [studentCode]
    );
    const [enrollments] = await pool.query(
      "SELECT student_code AS studentCode FROM enrollment WHERE group_id = ?",
      [groupId]
    );

    const blocker = findEnrollmentBlocker(groups[0], students[0], enrollments, studentCode);
    if (blocker) return res.status(blocker.status).json({ error: blocker.error });

    await pool.query(
      "INSERT INTO enrollment (student_code, group_id) VALUES (?, ?)",
      [studentCode, groupId]
    );

    try {
      const [updated] = await pool.query(
        "SELECT student_code AS studentCode FROM enrollment WHERE group_id = ?",
        [groupId]
      );
      await writeOfferings([buildOffering(groups[0], updated.length)]);
    } catch (firestoreError) {
      console.error(firestoreError);
      return res.status(502).json({
        error: "La inscripción se guardó en MySQL, pero no se pudo actualizar Firestore. Sincronice de nuevo el periodo.",
      });
    }

    res.status(201).json({ ok: true, message: "Inscripción realizada" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
