import express from "express";

import {
  createSubscription,
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

// All subscription routes require authentication
router.use(protect);

// --------------------------------------------------
// Create subscription
// --------------------------------------------------
router.post(
  "/",
  authorize("schoolAdmin"),
  createSubscription
);

// --------------------------------------------------
// Initialize initial subscription payment
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
// Initialize additional seats payment
// --------------------------------------------------
router.post(
  "/add-seats/pay",
  authorize("schoolAdmin"),
  initializeAdditionalSeatsPayment
);

// --------------------------------------------------
// Verify additional seats payment
// --------------------------------------------------
router.get(
  "/add-seats/payment/verify/:reference",
  authorize("schoolAdmin"),
  verifyAdditionalSeatsPayment
);

// --------------------------------------------------
// Get current subscription
// --------------------------------------------------
router.get(
  "/current",
  getCurrentSubscription
);

// --------------------------------------------------
// Get subscription for a specific term
// --------------------------------------------------
router.get(
  "/term",
  getTermSubscription
);

// --------------------------------------------------
// Check subscription status
// --------------------------------------------------
router.get(
  "/status",
  checkSubscriptionStatus
);

export default router;