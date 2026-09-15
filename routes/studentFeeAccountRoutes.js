import express from "express";

import {
  createStudentFeeAccount,
  getStudentFeeAccounts,
  getStudentFeeAccountById,
  getStudentFeeAccountsByStudent,
  getOutstandingFeesReport,
} from "../controllers/studentFeeAccountController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// ======================================================
// STUDENT FEE ACCOUNT MANAGEMENT
// ======================================================

// Create a fee account
router.post(
  "/",
  authorize("schoolAdmin"),
  createStudentFeeAccount
);

// Get all fee accounts
//
// Optional query parameters:
// ?academicSession=...
// ?academicTerm=...
// ?schoolClass=...
// ?status=unpaid|partial|paid
// ?student=...
// ?isActive=true|false
router.get(
  "/",
  authorize("schoolAdmin"),
  getStudentFeeAccounts
);

router.get(
  "/report/outstanding",
  protect,
  authorize("schoolAdmin"),
  getOutstandingFeesReport
);

// Get all fee accounts belonging to a specific student
router.get(
  "/student/:studentId",
  authorize("schoolAdmin"),
  getStudentFeeAccountsByStudent
);

// Get a single fee account
router.get(
  "/:id",
  authorize("schoolAdmin"),
  getStudentFeeAccountById
);

export default router;