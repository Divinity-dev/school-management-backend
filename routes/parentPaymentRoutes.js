import express from "express";

import {
  initializeParentSchoolFeePayment,
  verifyParentSchoolFeePayment,
} from "../controllers/parentPaymentController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/school-fees/initialize",
  protect,
  authorize("parent"),
  initializeParentSchoolFeePayment
);

router.get(
  "/school-fees/verify/:reference",
  protect,
  authorize("parent"),
  verifyParentSchoolFeePayment
);

export default router;