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

const router = express.Router();

// Mark attendance
router.post("/", protect, markAttendance);

// Get attendance for a class on a specific date
router.get("/class", protect, getClassAttendance);

router.get("/my", protect, getMyAttendance);

router.get("/my/summary", protect, getMyAttendanceSummary);

router.get(
  "/student/:studentId/summary",
  protect,
  getStudentAttendanceSummary
);

router.get(
  "/class/summary",
  protect,
  getClassAttendanceSummary
);

// Get attendance for a specific student
router.get("/student/:studentId", protect, getStudentAttendance);

// Update attendance
router.patch("/:attendanceId", protect, updateAttendance);

export default router;