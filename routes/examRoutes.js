import express from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";
import {
  createExam, getTeacherExams, getStudentExams, getExam,
  publishExam, closeExam, startExam, saveExamAnswers,
  submitExam, getExamSubmissions, gradeExamSubmission,
  getMyExamSubmission, getExamReview, getAdminExams, approveExam, rejectExam,
} from "../controllers/examController.js";

const router = express.Router();
router.use(protect, requireActiveSubscription);
router.post("/", authorize("teacher"), createExam);
router.get("/teacher", authorize("teacher", "schoolAdmin"), getTeacherExams);
router.get("/admin", authorize("schoolAdmin"), getAdminExams);
router.patch("/:examId/approve", authorize("schoolAdmin"), approveExam);
router.patch("/:examId/reject", authorize("schoolAdmin"), rejectExam);
router.get("/student", authorize("student"), getStudentExams);
router.get("/student/:examId/submission", authorize("student"), getMyExamSubmission);
router.get("/student/:examId/review", authorize("student"), getExamReview);
router.post("/:examId/start", authorize("student"), startExam);
router.patch("/:examId/answers", authorize("student"), saveExamAnswers);
router.post("/:examId/submit", authorize("student"), submitExam);
router.get("/:examId/submissions", authorize("teacher", "schoolAdmin"), getExamSubmissions);
router.patch("/:examId/submissions/:submissionId/grade", authorize("teacher"), gradeExamSubmission);
router.get("/:examId", getExam);
router.patch("/:examId/publish", authorize("schoolAdmin"), publishExam);
router.patch("/:examId/close", authorize("teacher"), closeExam);
export default router;
