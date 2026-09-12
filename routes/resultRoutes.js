import express from "express";
import {
  createResult,
  updateResult,
  submitResultForReview,
  publishResult,
  rejectResult,
  lockResult,
  getMyResults,
  getClassAverages,
  getClassRanking,
  getStudentReport,
  getTeacherResults,
  getTeacherRoster,
  submitTeacherResults,
} from "../controllers/resultController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createResult);

router.get("/my-results", protect, getMyResults);
router.get("/analytics/class-averages", protect, getClassAverages);
router.get("/analytics/class-rankings", protect, getClassRanking);
router.get("/student-report", protect, getStudentReport);
router.get("/teacher-results", protect, getTeacherResults);
router.get("/teacher-roster", protect, getTeacherRoster);
router.post("/teacher-results/submit", protect, submitTeacherResults);
router.put("/:id", protect, updateResult);

router.post("/:id/submit", protect, submitResultForReview);

router.post("/:id/publish", protect, publishResult);

router.post("/:id/reject", protect, rejectResult);

router.post("/:id/lock", protect, lockResult);

export default router;
