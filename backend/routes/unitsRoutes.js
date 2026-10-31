const express = require("express");
const router = express.Router();
const { requireAuth, requireLandlord } = require("../middleware/authMiddleware.js");
const { getUnits } = require("../controllers/unitsController.js");

router.get("/", requireAuth, requireLandlord, getUnits);

module.exports = router;