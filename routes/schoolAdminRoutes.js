import express from "express";

import { createSchoolAdmin } from "../controllers/schoolAdminController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

router.post(
  "/",
  protect,
  authorize("superAdmin"),
  requireActiveSubscription,
  createSchoolAdmin
);

export default router;