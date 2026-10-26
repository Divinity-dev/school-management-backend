import express from "express";
import {
  getPublicSchool,
  getSchoolWebsiteSettings,
  updateSchoolWebsiteSettings,
} from "../controllers/publicSchoolController.js";

import {
  setCustomSchoolDomain,
  verifyCustomSchoolDomain,
  resolveCustomSchoolDomain,
  resolveSchoolSubdomain,
} from "../controllers/customDomainController.js";

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
router.get("/domains/resolve", resolveCustomSchoolDomain);
router.get("/subdomains/resolve", resolveSchoolSubdomain);

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

router.post(
  "/school-website/custom-domain",
  protect,
  authorize("schoolAdmin"),
  setCustomSchoolDomain
);

router.post(
  "/school-website/custom-domain/verify",
  protect,
  authorize("schoolAdmin"),
  verifyCustomSchoolDomain
);

export default router;
