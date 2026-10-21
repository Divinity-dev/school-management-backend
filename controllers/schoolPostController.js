import SchoolPost from "../models/SchoolPost.js";
import School from "../models/School.js";

/*
|--------------------------------------------------------------------------
| Helper: Create Slug
|--------------------------------------------------------------------------
*/

const createSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

/*
|--------------------------------------------------------------------------
| Helper: Generate Unique Slug
|--------------------------------------------------------------------------
*/

const generateUniqueSlug = async (title, schoolId, excludeId = null) => {
  const baseSlug = createSlug(title);

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query = {
      school: schoolId,
      slug,
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existingPost = await SchoolPost.findOne(query);

    if (!existingPost) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
};

/*
|--------------------------------------------------------------------------
| ADMIN: CREATE POST
|--------------------------------------------------------------------------
| POST /api/public/school-posts
|--------------------------------------------------------------------------
*/

export const createSchoolPost = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({
        message: "No school associated with this account",
      });
    }

    const {
      type,
      title,
      excerpt,
      content,
      coverImage,
      eventDate,
      eventEndDate,
      location,
      isPublished,
    } = req.body;

    if (!type || !["news", "event"].includes(type)) {
      return res.status(400).json({
        message: "Post type must be either news or event",
      });
    }

    if (!title?.trim()) {
      return res.status(400).json({
        message: "Post title is required",
      });
    }

    if (!content?.trim()) {
      return res.status(400).json({
        message: "Post content is required",
      });
    }

    if (type === "event" && !eventDate) {
      return res.status(400).json({
        message: "Event date is required",
      });
    }

    const slug = await generateUniqueSlug(
      title,
      req.user.school
    );

    const published = Boolean(isPublished);

    const post = await SchoolPost.create({
      school: req.user.school,
      type,
      title: title.trim(),
      slug,
      excerpt: excerpt?.trim() || "",
      content: content.trim(),
      coverImage: coverImage || "",
      eventDate: type === "event" ? eventDate : null,
      eventEndDate: type === "event" ? eventEndDate || null : null,
      location: type === "event" ? location?.trim() || "" : "",
      isPublished: published,
      publishedAt: published ? new Date() : null,
    });

    return res.status(201).json({
      message: "Post created successfully",
      post,
    });
  } catch (error) {
    console.error("Create school post error:", error);

    return res.status(500).json({
      message: "Failed to create post",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ADMIN: GET ALL SCHOOL POSTS
|--------------------------------------------------------------------------
| GET /api/public/school-posts
|--------------------------------------------------------------------------
*/

export const getSchoolPosts = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({
        message: "No school associated with this account",
      });
    }

    const { type } = req.query;

    const filter = {
      school: req.user.school,
    };

    if (type) {
      if (!["news", "event"].includes(type)) {
        return res.status(400).json({
          message: "Invalid post type",
        });
      }

      filter.type = type;
    }

    const posts = await SchoolPost.find(filter)
      .sort({
        createdAt: -1,
      })
      .lean();

    return res.status(200).json({
      posts,
    });
  } catch (error) {
    console.error("Get school posts error:", error);

    return res.status(500).json({
      message: "Failed to retrieve posts",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ADMIN: GET SINGLE POST
|--------------------------------------------------------------------------
| GET /api/public/school-posts/:id
|--------------------------------------------------------------------------
*/

export const getSchoolPost = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({
        message: "No school associated with this account",
      });
    }

    const post = await SchoolPost.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    return res.status(200).json({
      post,
    });
  } catch (error) {
    console.error("Get school post error:", error);

    return res.status(500).json({
      message: "Failed to retrieve post",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ADMIN: UPDATE POST
|--------------------------------------------------------------------------
| PATCH /api/public/school-posts/:id
|--------------------------------------------------------------------------
*/

export const updateSchoolPost = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({
        message: "No school associated with this account",
      });
    }

    const post = await SchoolPost.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    const {
      type,
      title,
      excerpt,
      content,
      coverImage,
      eventDate,
      eventEndDate,
      location,
      isPublished,
    } = req.body;

    if (type !== undefined) {
      if (!["news", "event"].includes(type)) {
        return res.status(400).json({
          message: "Post type must be either news or event",
        });
      }

      post.type = type;
    }

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({
          message: "Post title cannot be empty",
        });
      }

      post.title = title.trim();

      post.slug = await generateUniqueSlug(
        title,
        req.user.school,
        post._id
      );
    }

    if (excerpt !== undefined) {
      post.excerpt = excerpt.trim();
    }

    if (content !== undefined) {
      if (!content.trim()) {
        return res.status(400).json({
          message: "Post content cannot be empty",
        });
      }

      post.content = content.trim();
    }

    if (coverImage !== undefined) {
      post.coverImage = coverImage;
    }

    if (eventDate !== undefined) {
      post.eventDate = eventDate || null;
    }

    if (eventEndDate !== undefined) {
      post.eventEndDate = eventEndDate || null;
    }

    if (location !== undefined) {
      post.location = location.trim();
    }

    if (isPublished !== undefined) {
      const wasPublished = post.isPublished;

      post.isPublished = Boolean(isPublished);

      if (!wasPublished && post.isPublished) {
        post.publishedAt = new Date();
      }

      if (wasPublished && !post.isPublished) {
        post.publishedAt = null;
      }
    }

    if (post.type === "event" && !post.eventDate) {
      return res.status(400).json({
        message: "Event date is required for event posts",
      });
    }

    if (post.type === "news") {
      post.eventDate = null;
      post.eventEndDate = null;
      post.location = "";
    }

    await post.save();

    return res.status(200).json({
      message: "Post updated successfully",
      post,
    });
  } catch (error) {
    console.error("Update school post error:", error);

    return res.status(500).json({
      message: "Failed to update post",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ADMIN: DELETE POST
|--------------------------------------------------------------------------
| DELETE /api/public/school-posts/:id
|--------------------------------------------------------------------------
*/

export const deleteSchoolPost = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({
        message: "No school associated with this account",
      });
    }

    const post = await SchoolPost.findOneAndDelete({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    return res.status(200).json({
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("Delete school post error:", error);

    return res.status(500).json({
      message: "Failed to delete post",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| PUBLIC: GET SCHOOL POSTS
|--------------------------------------------------------------------------
| GET /api/public/schools/:slug/posts
|--------------------------------------------------------------------------
|
| Optional:
| ?type=news
| ?type=event
|--------------------------------------------------------------------------
*/

export const getPublicSchoolPosts = async (req, res) => {
  try {
    const { slug } = req.params;
    const { type } = req.query;

    if (!slug) {
      return res.status(400).json({
        message: "School slug is required",
      });
    }

    if (type && !["news", "event"].includes(type)) {
      return res.status(400).json({
        message: "Invalid post type",
      });
    }

    const school = await School.findOne({
      slug: slug.toLowerCase().trim(),
      isActive: true,
      "website.enabled": true,
    }).select("_id");

    if (!school) {
      return res.status(404).json({
        message: "School website not found",
      });
    }

    const filter = {
      school: school._id,
      isPublished: true,
    };

    if (type) {
      filter.type = type;
    }

    const posts = await SchoolPost.find(filter)
      .sort({
        ...(type === "event"
          ? { eventDate: 1 }
          : { publishedAt: -1 }),
      })
      .lean();

    return res.status(200).json({
      posts,
    });
  } catch (error) {
    console.error("Get public school posts error:", error);

    return res.status(500).json({
      message: "Failed to retrieve public posts",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| PUBLIC: GET SINGLE POST
|--------------------------------------------------------------------------
| GET /api/public/schools/:slug/posts/:postSlug
|--------------------------------------------------------------------------
*/

export const getPublicSchoolPost = async (req, res) => {
  try {
    const { slug, postSlug } = req.params;

    if (!slug || !postSlug) {
      return res.status(400).json({
        message: "School slug and post slug are required",
      });
    }

    const school = await School.findOne({
      slug: slug.toLowerCase().trim(),
      isActive: true,
      "website.enabled": true,
    }).select("_id");

    if (!school) {
      return res.status(404).json({
        message: "School website not found",
      });
    }

    const post = await SchoolPost.findOne({
      school: school._id,
      slug: postSlug,
      isPublished: true,
    }).lean();

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    return res.status(200).json({
      post,
    });
  } catch (error) {
    console.error("Get public school post error:", error);

    return res.status(500).json({
      message: "Failed to retrieve public post",
      error: error.message,
    });
  }
};