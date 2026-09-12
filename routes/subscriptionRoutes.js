import express from "express";

import {
  createSubscription,
  getTermSubscription,
  getCurrentSubscription,
  checkSubscriptionStatus,
  activateSubscription,
  addStudentSeats,
} from "../controllers/subscriptionController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// School admin only
router.post(
  "/",
  authorize("schoolAdmin"),
  createSubscription
);

router.post(
  "/activate",
  authorize("schoolAdmin"),
  activateSubscription
);

router.post(
  "/add-seats",
  authorize("schoolAdmin"),
  addStudentSeats
);

// Read-only subscription information
router.get(
  "/current",
  getCurrentSubscription
);

router.get(
  "/term",
  getTermSubscription
);

router.get(
  "/status",
  checkSubscriptionStatus
);

export default router;