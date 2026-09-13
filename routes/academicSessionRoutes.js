import express from "express";

import {
  createAcademicSession,
  getAcademicSessions,
  getAcademicSession,
  setCurrentAcademicSession,
  updateAcademicSession,
  deactivateAcademicSession,
} from "../controllers/academicSessionController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

router.use(protect);

// View sessions
router.get("/", getAcademicSessions);

router.get("/:id", getAcademicSession);

// School administration
router.post(
  "/",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  createAcademicSession
);

router.patch(
  "/:id/current",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  setCurrentAcademicSession
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  updateAcademicSession
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  deactivateAcademicSession
);

export default router;