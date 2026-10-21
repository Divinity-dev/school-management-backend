import express from "express";

import {
  createSchoolPost,
  getSchoolPosts,
  getSchoolPost,
  updateSchoolPost,
  deleteSchoolPost,
  getPublicSchoolPosts,
  getPublicSchoolPost,
} from "../controllers/schoolPostController.js";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| PUBLIC
|--------------------------------------------------------------------------
*/

/*
GET /api/public/schools/:slug/posts
GET /api/public/schools/:slug/posts?type=news
GET /api/public/schools/:slug/posts?type=event
*/

router.get(
  "/schools/:slug/posts",
  getPublicSchoolPosts
);

/*
GET /api/public/schools/:slug/posts/:postSlug
*/

router.get(
  "/schools/:slug/posts/:postSlug",
  getPublicSchoolPost
);

/*
|--------------------------------------------------------------------------
| SCHOOL ADMIN
|--------------------------------------------------------------------------
*/

/*
POST /api/public/school-posts
*/

router.post(
  "/school-posts",
  protect,
  authorize("schoolAdmin"),
  createSchoolPost
);

/*
GET /api/public/school-posts
GET /api/public/school-posts?type=news
GET /api/public/school-posts?type=event
*/

router.get(
  "/school-posts",
  protect,
  authorize("schoolAdmin"),
  getSchoolPosts
);

/*
GET /api/public/school-posts/:id
*/

router.get(
  "/school-posts/:id",
  protect,
  authorize("schoolAdmin"),
  getSchoolPost
);

/*
PATCH /api/public/school-posts/:id
*/

router.patch(
  "/school-posts/:id",
  protect,
  authorize("schoolAdmin"),
  updateSchoolPost
);

/*
DELETE /api/public/school-posts/:id
*/

router.delete(
  "/school-posts/:id",
  protect,
  authorize("schoolAdmin"),
  deleteSchoolPost
);

export default router;