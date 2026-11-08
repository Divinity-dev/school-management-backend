import express from "express";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

import {
  getDashboardStats,
  getSchoolSubscriptionPricing,
  updateSchoolSubscriptionPricing,
} from "../controllers/superAdminController.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Super Admin Dashboard
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  protect,
  authorize("superAdmin"),
  getDashboardStats
);

router.get(
  "/subscription-pricing",
  protect,
  authorize("superAdmin"),
  getSchoolSubscriptionPricing
);

router.patch(
  "/schools/:schoolId/subscription-pricing",
  protect,
  authorize("superAdmin"),
  updateSchoolSubscriptionPricing
);

export default router;