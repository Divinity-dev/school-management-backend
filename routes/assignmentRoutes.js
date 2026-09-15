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
import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

// Create assignment
router.post(
  "/",
  protect,
  requireActiveSubscription,
  createAssignment
);

// Teacher assignment portal
router.get(
  "/teacher",
  protect,
  requireActiveSubscription,
  getTeacherAssignments
);

// Student assignment portal
router.get(
  "/student",
  protect,
  requireActiveSubscription,
  getStudentAssignments
);

// Student's own submission/result
router.get(
  "/:assignmentId/my-submission",
  protect,
  requireActiveSubscription,
  getStudentAssignmentSubmission
);

// Publish assignment
router.patch(
  "/:assignmentId/publish",
  protect,
  requireActiveSubscription,
  publishAssignment
);

// Close assignment
router.patch(
  "/:assignmentId/close",
  protect,
  requireActiveSubscription,
  closeAssignment
);

// Student submission
router.post(
  "/:assignmentId/submit",
  protect,
  requireActiveSubscription,
  submitAssignment
);

// Teacher/admin submission management
router.get(
  "/:assignmentId/submissions",
  protect,
  requireActiveSubscription,
  getAssignmentSubmissions
);

router.get(
  "/:assignmentId/submissions/:submissionId",
  protect,
  requireActiveSubscription,
  getAssignmentSubmission
);

router.patch(
  "/:assignmentId/submissions/:submissionId/grade",
  protect,
  requireActiveSubscription,
  gradeAssignmentSubmission
);

export default router;