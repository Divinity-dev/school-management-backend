import express from "express";

import {
  initializeSubscriptionPayment,
  verifySubscriptionPayment,
  handlePaystackWebhook,
} from "../controllers/paymentController.js";

import {protect} from "../middleware/authMiddleware.js";

const router = express.Router();

// Initialize subscription payment
router.post(
  "/subscription/initialize",
  protect,
  initializeSubscriptionPayment
);

router.post(
  "/webhook",
  handlePaystackWebhook
);

// Verify subscription payment
router.get(
  "/subscription/verify/:reference",
  protect,
  verifySubscriptionPayment
);

export default router;