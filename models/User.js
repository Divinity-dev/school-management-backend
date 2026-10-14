import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      trim: true,
      lowercase: true,
      default: undefined,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: undefined,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: true,
    },

    role: {
      type: String,
      enum: [
        "superAdmin",
        "schoolAdmin",
        "teacher",
        "student",
        "parent",
      ],
      required: true,
    },

    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      default: null,
    },

    phone: {
      type: String,
      trim: true,
    },

    profileImage: {
      type: String,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerificationToken: {
      type: String,
      default: null,
    },

    emailVerificationExpires: {
      type: Date,
      default: null,
    },

    passwordResetToken: {
      type: String,
      default: null,
    },

    passwordResetExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Usernames must be unique when provided.
userSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: {
      username: { $type: "string" },
    },
  }
);

// Email addresses must be unique when provided.
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" },
    },
  }
);

const User = mongoose.model("User", userSchema);

export default User;
