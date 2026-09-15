import express from "express";

import {
  markAttendance,
  getClassAttendance,
  getStudentAttendance,
  updateAttendance,
  getStudentAttendanceSummary,
  getClassAttendanceSummary,
  getMyAttendance,
  getMyAttendanceSummary,
} from "../controllers/attendanceController.js";

import { protect } from "../middleware/authMiddleware.js";
import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

// Mark attendance
router.post("/", protect, requireActiveSubscription, markAttendance);

// Get attendance for a class on a specific date
router.get(
  "/class",
  protect,
  requireActiveSubscription,
  getClassAttendance
);

router.get(
  "/my",
  protect,
  requireActiveSubscription,
  getMyAttendance
);

router.get(
  "/my/summary",
  protect,
  requireActiveSubscription,
  getMyAttendanceSummary
);

router.get(
  "/student/:studentId/summary",
  protect,
  requireActiveSubscription,
  getStudentAttendanceSummary
);

router.get(
  "/class/summary",
  protect,
  requireActiveSubscription,
  getClassAttendanceSummary
);

// Get attendance for a specific student
router.get(
  "/student/:studentId",
  protect,
  requireActiveSubscription,
  getStudentAttendance
);

// Update attendance
router.patch(
  "/:attendanceId",
  protect,
  requireActiveSubscription,
  updateAttendance
);

export default router;