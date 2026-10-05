import express from "express";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

import {
  getDashboardStats,
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

export default router;