import express from "express";
import {
  register,
  registerSchool,
  login,
} from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/register-school", registerSchool);
router.post("/login", login);

export default router;