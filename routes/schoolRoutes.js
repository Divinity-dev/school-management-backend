import express from "express";

import {
  createSchool,
  getSchoolGradingSystem,
  updateSchoolGradingSystem,
  getSchoolBankDetails,
  updateSchoolBankDetails,
  getReportCardBranding,
  updateReportCardBranding,
} from "../controllers/schoolController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// =========================================================
// SUPER ADMIN
// =========================================================

router.post(
  "/",
  protect,
  authorize("superAdmin"),
  createSchool
);

// =========================================================
// SCHOOL ADMIN GRADING SYSTEM
// =========================================================

router.get(
  "/grading-system",
  protect,
  authorize("schoolAdmin"),
  getSchoolGradingSystem
);

router.get(
  "/report-card-branding",
  protect,
  authorize("schoolAdmin"),
  getReportCardBranding
);

router.put(
  "/report-card-branding",
  protect,
  authorize("schoolAdmin"),
  updateReportCardBranding
);

router.put(
  "/grading-system",
  protect,
  authorize("schoolAdmin"),
  updateSchoolGradingSystem
);

// =========================================================
// SCHOOL ADMIN BANK DETAILS
// =========================================================

router.get(
  "/bank-details",
  protect,
  authorize("schoolAdmin"),
  getSchoolBankDetails
);

router.put(
  "/bank-details",
  protect,
  authorize("schoolAdmin"),
  updateSchoolBankDetails
);

export default router;