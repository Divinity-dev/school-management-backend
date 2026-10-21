import express from "express";

import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
} from "../controllers/userController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// Current user's profile
router.get("/me", getMyProfile);

router.put("/me", updateMyProfile);

router.put("/me/password", changeMyPassword);

export default router;