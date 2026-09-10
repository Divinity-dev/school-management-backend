import express from "express";
import { createSchoolAdmin } from "../controllers/schoolAdminController.js";
import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/",
  protect,
  authorize("superAdmin"),
  createSchoolAdmin
);

export default router;