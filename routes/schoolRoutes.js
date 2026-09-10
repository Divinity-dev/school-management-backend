import express from "express";
import { createSchool } from "../controllers/schoolController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/",
  protect,
  authorize("superAdmin"),
  createSchool
);

export default router;