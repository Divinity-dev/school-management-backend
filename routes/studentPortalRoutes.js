import express from "express";

import {
  getStudentDashboard,
} from "../controllers/studentPortalController.js";

import { protect } from "../middleware/authMiddleware.js";
import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

router.get(
  "/dashboard",
  protect,
  requireActiveSubscription,
  getStudentDashboard
);

export default router;