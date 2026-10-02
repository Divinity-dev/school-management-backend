import express from "express";

import {
  createSchool,
  getSchoolGradingSystem,
  updateSchoolGradingSystem,
  getSchoolBankDetails,
  updateSchoolBankDetails,
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