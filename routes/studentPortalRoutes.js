import express from "express";

import {
  getStudentDashboard,
} from "../controllers/studentPortalController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
  "/dashboard",
  protect,
  getStudentDashboard
);

export default router;