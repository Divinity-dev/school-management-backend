import express from "express";

import {
  createAssignment,
  getTeacherAssignments,
  getStudentAssignments,
  getStudentAssignmentSubmission,
  submitAssignment,
  getAssignmentSubmissions,
  getAssignmentSubmission,
  gradeAssignmentSubmission,
  publishAssignment,
  closeAssignment,
} from "../controllers/assignmentController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createAssignment);

router.get("/teacher", protect, getTeacherAssignments);

// Student assignment portal
router.get("/student", protect, getStudentAssignments);

// Student's own submission/result
router.get(
  "/:assignmentId/my-submission",
  protect,
  getStudentAssignmentSubmission
);

// Publish assignment
router.patch(
  "/:assignmentId/publish",
  protect,
  publishAssignment
);

// Close assignment
router.patch(
  "/:assignmentId/close",
  protect,
  closeAssignment
);

// Student submission
router.post(
  "/:assignmentId/submit",
  protect,
  submitAssignment
);

// Teacher/admin submission management
router.get(
  "/:assignmentId/submissions",
  protect,
  getAssignmentSubmissions
);

router.get(
  "/:assignmentId/submissions/:submissionId",
  protect,
  getAssignmentSubmission
);

router.patch(
  "/:assignmentId/submissions/:submissionId/grade",
  protect,
  gradeAssignmentSubmission
);

export default router;