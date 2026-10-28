
import express from "express";

import {
  createStudent,
  createStudentPortalAccount,
  getStudents,
  getStudentsBySession,
  getStudentsByClass,
  getStudentGrowth,
  getStudent,
  updateStudent,
  deactivateStudent,
} from "../controllers/studentController.js";

import {
  downloadStudentImportTemplate,
  previewStudentImport,
  confirmStudentImport,
  downloadStudentImportErrorReport,
} from "../controllers/studentImportController.js";

import upload from "../middleware/studentImportMiddleware.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

import {
  getStudentSeatAllocation,
  updateStudentSeatAllocation,
} from "../controllers/studentSeatController.js";

import {
  requireActiveSubscription,
} from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

// All student routes require authentication.
router.use(protect);

// Student import routes — register before /:id.
router.get(
  "/import/template",
  authorize("schoolAdmin"),
  downloadStudentImportTemplate
);

router.post(
  "/import/preview",
  authorize("schoolAdmin"),
  upload.single("file"),
  previewStudentImport
);

router.post(
  "/import/confirm",
  authorize("schoolAdmin"),
  upload.single("file"),
  confirmStudentImport
);

router.post(
  "/import/error-report",
  authorize("schoolAdmin"),
  downloadStudentImportErrorReport
);

// View students.
// Student directory endpoints expose personal and family contact information.
// Keep access to school staff only; students and parents use their own portal APIs.
router.get("/", authorize("schoolAdmin", "teacher"), getStudents);
router.get("/session/:sessionId", authorize("schoolAdmin", "teacher"), getStudentsBySession);
router.get("/class/:classId", authorize("schoolAdmin", "teacher"), getStudentsByClass);
router.get("/growth", authorize("schoolAdmin", "teacher"), getStudentGrowth);

// Purchased seat assignment. Must be registered before the generic /:id route.
router.get(
  "/seat-allocation",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  getStudentSeatAllocation
);

router.put(
  "/seat-allocation",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  updateStudentSeatAllocation
);

// School administration.
router.post(
  "/",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  createStudent
);

router.post(
  "/:id/create-account",
  authorize("schoolAdmin"),
  createStudentPortalAccount
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  updateStudent
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  deactivateStudent
);

// Keep the generic ID route after the named routes.
router.get("/:id", authorize("schoolAdmin", "teacher"), getStudent);

export default router;
