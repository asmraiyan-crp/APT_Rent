const express = require("express");
const router = express.Router();
const { requireAuth, requireTenant } = require("../middleware/authMiddleware.js");
const { getTenantDashboard } = require("../controllers/tenantDashboardController.js");

router.get("/dashboard", requireAuth, requireTenant, getTenantDashboard);

module.exports = router;