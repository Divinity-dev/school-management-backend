import express from "express";

import {
  createSubject,
  getSubjects,
  getSubject,
  updateSubject,
  deactivateSubject,
} from "../controllers/subjectController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getSubjects);

router.get("/:id", getSubject);

router.post(
  "/",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  createSubject
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  updateSubject
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  deactivateSubject
);

export default router;