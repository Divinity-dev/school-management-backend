import express from "express";

import {
  createSchoolClass,
  getSchoolClasses,
  getClassesBySession,
  getSchoolClass,
  updateSchoolClass,
  deactivateSchoolClass,
} from "../controllers/schoolClassController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// All class routes require authentication
router.use(protect);

// View classes
router.get("/", getSchoolClasses);
router.get("/session/:sessionId", getClassesBySession);
router.get("/:id", getSchoolClass);

// School administration
router.post(
  "/",
  authorize("schoolAdmin"),
  createSchoolClass
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  updateSchoolClass
);

router.patch(
  "/:id/deactivate",
  authorize("schoolAdmin"),
  deactivateSchoolClass
);

export default router;