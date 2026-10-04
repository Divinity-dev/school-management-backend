import express from "express";
import {
  getPublicSchool,
  getSchoolWebsiteSettings,
  updateSchoolWebsiteSettings,
} from "../controllers/publicSchoolController.js";

import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Public School Website
|--------------------------------------------------------------------------
|
| GET /api/public/schools/:slug
|
| No authentication required because this is the public website.
|
*/

router.get("/schools/:slug", getPublicSchool);

/*
|--------------------------------------------------------------------------
| School Admin Website Settings
|--------------------------------------------------------------------------
|
| GET   /api/public/school-website/settings
| PATCH /api/public/school-website/settings
|
| Authentication required.
| No subscription required.
|
*/

router.get(
  "/school-website/settings",
  protect,
  authorize("schoolAdmin"),
  getSchoolWebsiteSettings
);

router.patch(
  "/school-website/settings",
  protect,
  authorize("schoolAdmin"),
  updateSchoolWebsiteSettings
);

export default router;