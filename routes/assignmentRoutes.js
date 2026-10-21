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
  getAssignment,
  updateAssignment,
} from "../controllers/assignmentController.js";

import { protect } from "../middleware/authMiddleware.js";
import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Create Assignment
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  protect,
  requireActiveSubscription,
  createAssignment
);

/*
|--------------------------------------------------------------------------
| Teacher Assignment Portal
|--------------------------------------------------------------------------
*/

router.get(
  "/teacher",
  protect,
  requireActiveSubscription,
  getTeacherAssignments
);

/*
|--------------------------------------------------------------------------
| Student Assignment Portal
|--------------------------------------------------------------------------
*/

router.get(
  "/student",
  protect,
  requireActiveSubscription,
  getStudentAssignments
);

/*
|--------------------------------------------------------------------------
| Student's Own Submission / Result
|--------------------------------------------------------------------------
|
| This route MUST come before /:assignmentId.
| Otherwise Express may match "my-submission" incorrectly.
|
*/

router.get(
  "/:assignmentId/my-submission",
  protect,
  requireActiveSubscription,
  getStudentAssignmentSubmission
);

/*
|--------------------------------------------------------------------------
| Single Assignment
|--------------------------------------------------------------------------
*/

router.get(
  "/:assignmentId",
  protect,
  requireActiveSubscription,
  getAssignment
);

/*
|--------------------------------------------------------------------------
| Update Assignment
|--------------------------------------------------------------------------
*/

router.put(
  "/:assignmentId",
  protect,
  requireActiveSubscription,
  updateAssignment
);

/*
|--------------------------------------------------------------------------
| Publish Assignment
|--------------------------------------------------------------------------
*/

router.patch(
  "/:assignmentId/publish",
  protect,
  requireActiveSubscription,
  publishAssignment
);

/*
|--------------------------------------------------------------------------
| Close Assignment
|--------------------------------------------------------------------------
*/

router.patch(
  "/:assignmentId/close",
  protect,
  requireActiveSubscription,
  closeAssignment
);

/*
|--------------------------------------------------------------------------
| Student Submission
|--------------------------------------------------------------------------
*/

router.post(
  "/:assignmentId/submit",
  protect,
  requireActiveSubscription,
  submitAssignment
);

/*
|--------------------------------------------------------------------------
| Teacher/Admin Submission Management
|--------------------------------------------------------------------------
*/

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