function escapeHtml(text) {
  return String(text ?? "-").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function showMessage(elementId, text) {
  document.getElementById(elementId).textContent = text;
}

async function callApi(method, route, messageId, body) {
  try {
    const options = { method };
    if (body) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }
    const response = await fetch(route, options);
    const data = await response.json();

    if (!response.ok) {
      showMessage(messageId, data.error);
      return null;
    }
    return data;
  } catch (error) {
    showMessage(messageId, error.message);
    return null;
  }
}

function paintTable(rows) {
  document.getElementById("tabla-oferta").innerHTML = rows
    .map(
      (g) => `<tr>
        <td>${escapeHtml(g.groupId)}</td>
        <td>${escapeHtml(g.subjectName)}</td>
        <td>${escapeHtml(g.departmentName)}</td>
        <td>${escapeHtml(g.groupNumber)}</td>
        <td>${escapeHtml(g.professorName)}</td>
        <td>${escapeHtml(g.capacity)}</td>
        <td>${escapeHtml(g.enrolled)}</td>
      </tr>`
    )
    .join("");
}

function readFilters() {
  return {
    department: document.getElementById("oferta-dependencia").value.trim(),
    period: document.getElementById("oferta-periodo").value.trim(),
  };
}

async function loadOffering() {
  const { department, period } = readFilters();
  const query = `department=${encodeURIComponent(department)}&period=${encodeURIComponent(period)}`;
  const offering = await callApi("GET", `/offerings?${query}`, "oferta-mensaje");
  if (!offering) {
    paintTable([]);
    return;
  }
  paintTable(offering);
  showMessage("oferta-mensaje", offering.length === 0 ? "No hay grupos para esa dependencia y periodo" : "");
}

document.getElementById("form-sincronizar").addEventListener("submit", async (event) => {
  event.preventDefault();
  const period = document.getElementById("sync-periodo").value.trim();
  const data = await callApi("POST", `/sync/oferta/${encodeURIComponent(period)}`, "sync-mensaje");
  if (data) showMessage("sync-mensaje", `Se sincronizaron ${data.synced} grupos del periodo ${data.period}`);
});

document.getElementById("form-oferta").addEventListener("submit", (event) => {
  event.preventDefault();
  loadOffering();
});

document.getElementById("form-inscripcion").addEventListener("submit", async (event) => {
  event.preventDefault();
  const studentCode = document.getElementById("inscripcion-codigo").value.trim();
  const groupId = document.getElementById("inscripcion-grupo").value.trim();
  const data = await callApi(
    "POST",
    `/groups/${encodeURIComponent(groupId)}/enrollments`,
    "inscripcion-mensaje",
    { studentCode }
  );
  if (!data) return;

  showMessage("inscripcion-mensaje", data.message);
  const { department, period } = readFilters();
  if (department && period) loadOffering();
});
