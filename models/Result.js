import mongoose from "mongoose";

const gradingScaleSnapshotSchema = new mongoose.Schema(
  {
    min: {
      type: Number,
      required: true,
    },

    max: {
      type: Number,
      required: true,
    },

    grade: {
      type: String,
      required: true,
      trim: true,
    },

    remark: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const gradingSystemSnapshotSchema = new mongoose.Schema(
  {
    caMaximum: {
      type: Number,
      required: true,
      min: 0,
    },

    examMaximum: {
      type: Number,
      required: true,
      min: 0,
    },

    totalMaximum: {
      type: Number,
      required: true,
      min: 1,
    },

    gradingScale: {
      type: [gradingScaleSnapshotSchema],
      required: true,
    },
  },
  {
    _id: false,
  }
);

const resultSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    schoolClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolClass",
      required: true,
      index: true,
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },

    academicSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
      index: true,
    },

    academicTerm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicTerm",
      required: true,
      index: true,
    },

    caScore: {
      type: Number,
      required: true,
      min: 0,
    },

    examScore: {
      type: Number,
      required: true,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    grade: {
      type: String,
      required: true,
      trim: true,
    },

    remark: {
      type: String,
      required: true,
      trim: true,
    },

    gradingSystem: {
      type: gradingSystemSnapshotSchema,
      required: true,
    },

    status: {
      type: String,
      enum: ["draft", "pending_review", "published", "locked"],
      default: "draft",
      index: true,
    },

    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    lockedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

resultSchema.index(
  {
    school: 1,
    student: 1,
    subject: 1,
    academicSession: 1,
    academicTerm: 1,
  },
  {
    unique: true,
  }
);

const Result = mongoose.model("Result", resultSchema);

export default Result;
