import express from "express";
import {
  markAttendance,
  getClassAttendance,
  getStudentAttendance,
  updateAttendance,
  getStudentAttendanceSummary,
  getClassAttendanceSummary,
} from "../controllers/attendanceController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Mark attendance
router.post("/", protect, markAttendance);

// Get attendance for a class on a specific date
router.get("/class", protect, getClassAttendance);

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