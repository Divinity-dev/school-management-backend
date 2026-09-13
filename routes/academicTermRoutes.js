import express from "express";

import {
  createAcademicTerm,
  getAcademicTerms,
  getTermsBySession,
  getAcademicTerm,
  setCurrentAcademicTerm,
  updateAcademicTerm,
  deactivateAcademicTerm,
} from "../controllers/academicTermController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

// All academic-term routes require authentication
router.use(protect);

// View terms
router.get("/", getAcademicTerms);

router.get("/session/:sessionId", getTermsBySession);

router.get("/:id", getAcademicTerm);

// School administration
router.post(
  "/",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  createAcademicTerm
);

router.patch(
  "/:id/current",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  setCurrentAcademicTerm
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  updateAcademicTerm
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  deactivateAcademicTerm
);

export default router;