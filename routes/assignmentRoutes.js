import express from "express";

import {
  createAssignment,
  getTeacherAssignments,
  submitAssignment,
  getAssignmentSubmissions,
  getAssignmentSubmission,
  gradeAssignmentSubmission,
} from "../controllers/assignmentController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createAssignment);

router.get("/teacher", protect, getTeacherAssignments);

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