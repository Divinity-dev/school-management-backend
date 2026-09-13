import express from "express";

import {
  createSubjectAssignment,
  getSubjectAssignments,
  getAssignmentsByClass,
  getSubjectAssignment,
  updateSubjectAssignment,
  deactivateSubjectAssignment,
} from "../controllers/subjectAssignmentController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getSubjectAssignments);

router.get("/class/:classId", getAssignmentsByClass);

router.get("/:id", getSubjectAssignment);

router.post(
  "/",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  createSubjectAssignment
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  updateSubjectAssignment
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  deactivateSubjectAssignment
);

export default router;