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

const router = express.Router();

// All academic-term routes require authentication
router.use(protect);

// View terms
router.get("/", getAcademicTerms);
router.get("/session/:sessionId", getTermsBySession);


// School administration
router.post(
  "/",
  authorize("schoolAdmin"),
  createAcademicTerm
);

router.patch(
  "/:id/current",
  authorize("schoolAdmin"),
  setCurrentAcademicTerm
);

router.get("/:id", getAcademicTerm);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  updateAcademicTerm
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  deactivateAcademicTerm
);

export default router;