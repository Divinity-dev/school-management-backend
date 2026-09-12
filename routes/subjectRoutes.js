import express from "express";

import {
  createSubject,
  getSubjects,
  getSubject,
  updateSubject,
  deactivateSubject,
} from "../controllers/subjectController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getSubjects);
router.get("/:id", getSubject);

router.post(
  "/",
  authorize("schoolAdmin"),
  createSubject
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  updateSubject
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  deactivateSubject
);

export default router;