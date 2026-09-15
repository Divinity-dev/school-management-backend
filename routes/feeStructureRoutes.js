import express from "express";

import {
  createFeeStructure,
  updateFeeStructure,
} from "../controllers/feeStructureController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post(
  "/",
  authorize("schoolAdmin"),
  createFeeStructure
);

router.put(
  "/:feeStructureId",
  authorize("schoolAdmin"),
  updateFeeStructure
);

export default router;