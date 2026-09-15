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

const router = express.Router();

router.use(protect);

// View sessions
router.get("/", getAcademicSessions);

router.get("/:id", getAcademicSession);

// Academic session setup and management
// These operations are available before subscription.

router.post(
  "/",
  authorize("schoolAdmin"),
  createAcademicSession
);

router.patch(
  "/:id/current",
  authorize("schoolAdmin"),
  setCurrentAcademicSession
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  updateAcademicSession
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  deactivateAcademicSession
);

export default router;