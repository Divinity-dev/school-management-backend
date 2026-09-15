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
import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

// Create result
router.post(
  "/",
  protect,
  requireActiveSubscription,
  createResult
);

// Read-only routes
router.get("/my-results", protect, getMyResults);

router.get(
  "/analytics/class-averages",
  protect,
  getClassAverages
);

router.get(
  "/analytics/class-rankings",
  protect,
  getClassRanking
);

router.get(
  "/student-report",
  protect,
  getStudentReport
);

router.get(
  "/teacher-results",
  protect,
  getTeacherResults
);

router.get(
  "/teacher-roster",
  protect,
  getTeacherRoster
);

// Submit teacher results
router.post(
  "/teacher-results/submit",
  protect,
  requireActiveSubscription,
  submitTeacherResults
);

// Update result
router.put(
  "/:id",
  protect,
  requireActiveSubscription,
  updateResult
);

// Submit result for review
router.post(
  "/:id/submit",
  protect,
  requireActiveSubscription,
  submitResultForReview
);

// Publish result
router.post(
  "/:id/publish",
  protect,
  requireActiveSubscription,
  publishResult
);

// Reject result
router.post(
  "/:id/reject",
  protect,
  requireActiveSubscription,
  rejectResult
);

// Lock result
router.post(
  "/:id/lock",
  protect,
  requireActiveSubscription,
  lockResult
);

export default router;