import express from "express";

import {
  createFeeStructure,
  getFeeStructures,
  getFeeStructure,
  updateFeeStructure,
} from "../controllers/feeStructureController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// View fee structures
router.get(
  "/",
  authorize("schoolAdmin"),
  getFeeStructures
);

// View single fee structure
router.get(
  "/:feeStructureId",
  authorize("schoolAdmin"),
  getFeeStructure
);

// Create fee structure
router.post(
  "/",
  authorize("schoolAdmin"),
  createFeeStructure
);

// Update fee structure
router.put(
  "/:feeStructureId",
  authorize("schoolAdmin"),
  updateFeeStructure
);

export default router;