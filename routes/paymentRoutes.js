import express from "express";

import {
  initializeSubscriptionPayment,
  verifySubscriptionPayment,
  handlePaystackWebhook,
  initializeSchoolFeePayment,
  verifySchoolFeePayment,
  getSchoolFeePayments,
  getSchoolFeePaymentById,
  recordOfflineSchoolFeePayment,
  updateOfflineSchoolFeePayment,
} from "../controllers/paymentController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ===============================
// Paystack webhook
// IMPORTANT: This must NOT be protected by JWT.
// ===============================

router.post(
  "/webhook",
  handlePaystackWebhook
);

// ===============================
// Protected payment routes
// ===============================

router.post(
  "/subscription/initialize",
  protect,
  authorize("schoolAdmin"),
  initializeSubscriptionPayment
);

router.get(
  "/school-fees",
  protect,
  authorize("schoolAdmin"),
  getSchoolFeePayments
);

// Offline school fee payment
router.post(
  "/school-fees/offline",
  protect,
  authorize("schoolAdmin"),
  recordOfflineSchoolFeePayment
);

router.put(
  "/school-fees/:id/offline",
  protect,
  authorize("schoolAdmin"),
  updateOfflineSchoolFeePayment
);

// Online school fee payment
router.post(
  "/school-fees/initialize",
  protect,
  authorize("schoolAdmin"),
  initializeSchoolFeePayment
);

router.get(
  "/subscription/verify/:reference",
  protect,
  authorize("schoolAdmin"),
  verifySubscriptionPayment
);

router.get(
  "/school-fees/verify/:reference",
  protect,
  authorize("schoolAdmin"),
  verifySchoolFeePayment
);

router.get(
  "/school-fees/:id",
  protect,
  authorize("schoolAdmin"),
  getSchoolFeePaymentById
);

export default router