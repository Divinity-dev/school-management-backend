import express from "express";

import {
  createParent,
  linkStudentToParent,
  getMyChildren,
  getMyChild,
  getMyChildResults,
  getMyChildFees,
  getMyChildPayments,
} from "../controllers/parentController.js";

import {
  getStudentAttendance,
  getStudentAttendanceSummary,
} from "../controllers/attendanceController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post(
  "/",
  authorize("schoolAdmin"),
  createParent
);

router.get(
  "/children",
  authorize("parent"),
  getMyChildren
);

router.get(
  "/children/:studentId",
  authorize("parent"),
  getMyChild
);


router.get(
  "/children/:studentId/fees",
  authorize("parent"),
  getMyChildFees
);

router.get(
  "/children/:studentId/results",
  authorize("parent"),
  getMyChildResults
);

router.get(
  "/children/:studentId/payments",
  authorize("parent"),
  getMyChildPayments
);

router.get(
  "/children/:studentId/attendance/summary",
  authorize("parent"),
  getStudentAttendanceSummary
);

router.get(
  "/children/:studentId/attendance",
  authorize("parent"),
  getStudentAttendance
);

router.post(
  "/:parentId/students/:studentId",
  authorize("schoolAdmin"),
  linkStudentToParent
);

export default router;