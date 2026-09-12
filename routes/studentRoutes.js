import express from "express";

import {
  createStudent,
  createStudentPortalAccount,
  getStudents,
  getStudentsBySession,
  getStudentsByClass,
  getStudent,
  updateStudent,
  deactivateStudent,
} from "../controllers/studentController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// All student routes require authentication
router.use(protect);

// View students
router.get("/", getStudents);

router.get("/session/:sessionId", getStudentsBySession);

router.get("/class/:classId", getStudentsByClass);

router.get("/:id", getStudent);

// School administration
router.post(
  "/",
  authorize("schoolAdmin"),
  createStudent
);

// Create portal account for an existing student
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

export default router;