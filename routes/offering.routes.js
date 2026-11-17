const express = require("express");
const router = express.Router();
const offeringDao = require("../dao/offering.dao");

router.post("/sync/oferta/:periodo", offeringDao.syncOffering);
router.get("/offerings", offeringDao.getOffering);
router.post("/groups/:groupId/enrollments", offeringDao.createEnrollment);

module.exports = router;
