
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
  getAdminResults,
  getResultForAdminReview,
  getAdminClassResultsMatrix,
} from "../controllers/resultController.js";

import {
  getMyReportCard,
  getSchoolDaysOpened,
  updateSchoolDaysOpened,
} from "../controllers/reportCardController.js";

import { protect, authorize } from "../middleware/authMiddleware.js";
import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";
import { requireStudentSeatForResult } from "../middleware/resultSeatMiddleware.js";

const router = express.Router();

// Create a result
router.post(
  "/",
  protect,
  authorize("teacher", "schoolAdmin", "superAdmin"),
  requireActiveSubscription,
  requireStudentSeatForResult,
  createResult
);

// Read-only routes
router.get("/my-results", protect, getMyResults);

router.get(
  "/admin-results",
  protect,
  authorize("schoolAdmin", "superAdmin"),
  getAdminResults
);

router.get(
  "/admin-class-matrix",
  protect,
  authorize("schoolAdmin", "superAdmin"),
  getAdminClassResultsMatrix
);

router.get(
  "/analytics/class-averages",
  protect,
  authorize("schoolAdmin", "superAdmin"),
  getClassAverages
);

router.get(
  "/analytics/class-rankings",
  protect,
  authorize("schoolAdmin", "superAdmin"),
  getClassRanking
);

router.get(
  "/student-report",
  protect,
  authorize("schoolAdmin", "superAdmin", "teacher"),
  getStudentReport
);

router.get(
  "/teacher-results",
  protect,
  authorize("teacher"),
  getTeacherResults
);

router.get(
  "/teacher-roster",
  protect,
  authorize("teacher"),
  getTeacherRoster
);

router.get(
  "/report-card",
  protect,
  getMyReportCard
);

// School days opened settings
router.get(
  "/school-days-opened",
  protect,
  authorize("schoolAdmin", "superAdmin"),
  getSchoolDaysOpened
);

router.put(
  "/school-days-opened",
  protect,
  authorize("schoolAdmin", "superAdmin"),
  updateSchoolDaysOpened
);

// Submit teacher results in bulk
router.post(
  "/teacher-results/submit",
  protect,
  authorize("teacher"),
  requireActiveSubscription,
  requireStudentSeatForResult,
  submitTeacherResults
);

// Admin review
router.get(
  "/admin-review/:id",
  protect,
  authorize("schoolAdmin", "superAdmin"),
  getResultForAdminReview
);

// Update a result
router.put(
  "/:id",
  protect,
  authorize("teacher", "schoolAdmin", "superAdmin"),
  requireActiveSubscription,
  requireStudentSeatForResult,
  updateResult
);

// Submit result for review
router.post(
  "/:id/submit",
  protect,
  authorize("teacher"),
  requireActiveSubscription,
  requireStudentSeatForResult,
  submitResultForReview
);

// Publish result
router.post(
  "/:id/publish",
  protect,
  authorize("schoolAdmin", "superAdmin"),
  requireActiveSubscription,
  requireStudentSeatForResult,
  publishResult
);

// Reject result
router.post(
  "/:id/reject",
  protect,
  authorize("schoolAdmin", "superAdmin"),
  requireActiveSubscription,
  requireStudentSeatForResult,
  rejectResult
);

// Lock result
router.post(
  "/:id/lock",
  protect,
  authorize("schoolAdmin", "superAdmin"),
  requireActiveSubscription,
  requireStudentSeatForResult,
  lockResult
);

export default router;
