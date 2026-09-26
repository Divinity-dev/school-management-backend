import express from "express";

import {
  getSubscriptionPricing,
  initializeSubscriptionPayment,
  verifySubscriptionPayment,
  initializeAdditionalSeatsPayment,
  verifyAdditionalSeatsPayment,
  getTermSubscription,
  getCurrentSubscription,
  checkSubscriptionStatus,
} from "../controllers/subscriptionController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// --------------------------------------------------
// All subscription routes require authentication
// --------------------------------------------------
router.use(protect);

// --------------------------------------------------
// Subscription pricing
// --------------------------------------------------
router.get(
  "/pricing",
  authorize("schoolAdmin"),
  getSubscriptionPricing
);

// --------------------------------------------------
// Initial subscription payment
// --------------------------------------------------
router.post(
  "/pay",
  authorize("schoolAdmin"),
  initializeSubscriptionPayment
);

// --------------------------------------------------
// Verify initial subscription payment
// --------------------------------------------------
router.get(
  "/payment/verify/:reference",
  authorize("schoolAdmin"),
  verifySubscriptionPayment
);

// --------------------------------------------------
// Additional student seats
// --------------------------------------------------
router.post(
  "/add-seats/pay",
  authorize("schoolAdmin"),
  initializeAdditionalSeatsPayment
);

// --------------------------------------------------
// Verify additional student seats payment
// --------------------------------------------------
router.get(
  "/add-seats/payment/verify/:reference",
  authorize("schoolAdmin"),
  verifyAdditionalSeatsPayment
);

// --------------------------------------------------
// Get subscription for specific academic term
// --------------------------------------------------
router.get(
  "/term",
  authorize("schoolAdmin"),
  getTermSubscription
);

// --------------------------------------------------
// Get current subscription
// --------------------------------------------------
router.get(
  "/current",
  authorize("schoolAdmin"),
  getCurrentSubscription
);

// --------------------------------------------------
// Check subscription status
// --------------------------------------------------
router.get(
  "/status",
  authorize("schoolAdmin"),
  checkSubscriptionStatus
);

export default router;