import express from "express";

import {
  register,
  registerSchool,
  login,
  verifyEmail,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);

router.post("/register-school", registerSchool);

router.post("/login", login);

router.get("/verify-email", verifyEmail);

router.post("/forgot-password", forgotPassword);

router.post("/verify-reset-otp", verifyResetOtp);

router.post("/reset-password", resetPassword);

export default router;