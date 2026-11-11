import express from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { requireActiveSubscription } from "../middleware/subscriptionMiddleware.js";
import {
  listQuestionBank,
  createBankQuestion,
  updateBankQuestion,
  deleteBankQuestion,
  generateBankQuestions,
  importBankQuestions,
  uploadQuestionMaterial,
  uploadQuestionImport,
} from "../controllers/questionBankController.js";

const router = express.Router();
router.use(protect);
router.use((req, res, next) => req.user.role === "superAdmin" ? next() : requireActiveSubscription(req, res, next));
router.get("/", authorize("teacher", "schoolAdmin", "superAdmin"), listQuestionBank);
router.post("/", authorize("teacher", "schoolAdmin", "superAdmin"), createBankQuestion);
router.post("/generate", authorize("teacher", "schoolAdmin", "superAdmin"), uploadQuestionMaterial, generateBankQuestions);
router.post("/import", authorize("teacher", "schoolAdmin", "superAdmin"), uploadQuestionImport, importBankQuestions);
router.patch("/:questionId", authorize("teacher", "schoolAdmin", "superAdmin"), updateBankQuestion);
router.delete("/:questionId", authorize("teacher", "schoolAdmin", "superAdmin"), deleteBankQuestion);
export default router;
