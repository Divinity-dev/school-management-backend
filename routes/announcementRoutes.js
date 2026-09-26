import express from "express";

import {
  createAnnouncement,
  getAnnouncements,
  getMyAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
} from "../controllers/announcementController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// Users: view announcements relevant to their role
router.get(
  "/my",
  authorize("parent", "teacher", "student"),
  getMyAnnouncements
);

// School admin: announcement management
router.post(
  "/",
  authorize("schoolAdmin"),
  createAnnouncement
);

router.get(
  "/",
  authorize("schoolAdmin"),
  getAnnouncements
);

router.get(
  "/:id",
  authorize("schoolAdmin"),
  getAnnouncementById
);

router.put(
  "/:id",
  authorize("schoolAdmin"),
  updateAnnouncement
);

router.delete(
  "/:id",
  authorize("schoolAdmin"),
  deleteAnnouncement
);

export default router;