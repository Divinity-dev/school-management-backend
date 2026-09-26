import express from "express";

import {
  createSchoolClass,
  getSchoolClasses,
  getClassesBySession,
  getSchoolClass,
  updateSchoolClass,
  deactivateSchoolClass,
} from "../controllers/schoolClassController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

// All class routes require authentication
router.use(protect);

// View classes
router.get("/", getSchoolClasses);

router.get("/session/:sessionId", getClassesBySession);

router.get("/:id", getSchoolClass);

// School administration
router.post(
  "/",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  createSchoolClass
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  updateSchoolClass
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  requireActiveSubscription,
  deactivateSchoolClass
);

export default router;