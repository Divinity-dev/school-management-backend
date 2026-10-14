
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
router.get("/", getStudents);
router.get("/session/:sessionId", getStudentsBySession);
router.get("/class/:classId", getStudentsByClass);
router.get("/growth", getStudentGrowth);

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
router.get("/:id", getStudent);

export default router;
