import express from "express";

import {
  createTeacher,
  getTeachers,
  getTeacher,
  updateTeacher,
  deactivateTeacher,
} from "../controllers/teacherController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getTeachers);
router.get("/:id", getTeacher);

router.post(
  "/",
  authorize("schoolAdmin"),
  createTeacher
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  updateTeacher
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  deactivateTeacher
);

export default router;