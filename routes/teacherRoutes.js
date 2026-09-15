import express from "express";

import {
  createTeacher,
  getTeachers,
  getTeacher,
  updateTeacher,
  deactivateTeacher,
} from "../controllers/teacherController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getTeachers);

router.get("/:id", getTeacher);

router.post(
  "/",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  createTeacher
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  updateTeacher
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  deactivateTeacher
);

export default router;