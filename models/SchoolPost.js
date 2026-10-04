import mongoose from "mongoose";

const schoolPostSchema = new mongoose.Schema(
  {
    /*
    |--------------------------------------------------------------------------
    | School
    |--------------------------------------------------------------------------
    */

    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Post Type
    |--------------------------------------------------------------------------
    */

    type: {
      type: String,
      enum: ["news", "event"],
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Basic Content
    |--------------------------------------------------------------------------
    */

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    slug: {
      type: String,
      required: true,
      trim: true,
    },

    excerpt: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },

    content: {
      type: String,
      required: true,
      trim: true,
    },

    coverImage: {
      type: String,
      trim: true,
      default: "",
    },

    /*
    |--------------------------------------------------------------------------
    | Event Information
    |--------------------------------------------------------------------------
    | These fields are mainly used when type === "event".
    */

    eventDate: {
      type: Date,
      default: null,
    },

    eventEndDate: {
      type: Date,
      default: null,
    },

    location: {
      type: String,
      trim: true,
      default: "",
    },

    /*
    |--------------------------------------------------------------------------
    | Publishing
    |--------------------------------------------------------------------------
    */

    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },

    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

schoolPostSchema.index({
  school: 1,
  type: 1,
  isPublished: 1,
});

schoolPostSchema.index({
  school: 1,
  slug: 1,
});

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
*/

schoolPostSchema.pre("validate", function (next) {
  if (this.type === "event") {
    if (!this.eventDate) {
      return next(
        new Error("Event date is required for event posts.")
      );
    }
  }

  if (this.type === "news") {
    this.eventDate = null;
    this.eventEndDate = null;
    this.location = "";
  }

  next();
});

const SchoolPost = mongoose.model(
  "SchoolPost",
  schoolPostSchema
);

export default SchoolPost;