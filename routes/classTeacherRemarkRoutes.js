import express from "express";

import {
getClassTeacherRemarks,
saveClassTeacherRemarks,
submitClassTeacherRemarks,
} from "../controllers/classTeacherRemarkController.js";

import {
protect,
authorize,
} from "../middleware/authMiddleware.js";

import {
requireActiveSubscription,
} from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(authorize("teacher"));
router.use(requireActiveSubscription);

// Get the assigned class roster and existing remarks.
router.get("/class", getClassTeacherRemarks);

// Save remarks as drafts.
router.put("/class/:schoolClass", saveClassTeacherRemarks);

// Submit all remarks for the selected class, session and term.
router.put(
"/class/:schoolClass/submit",
submitClassTeacherRemarks
);

export default router;
