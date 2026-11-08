import mongoose from "mongoose";

const assignmentSubmissionSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    answers: {
      type: [{
        questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
        answer: { type: String, default: "" },
      }],
      default: [],
    },

    autoScore: { type: Number, default: null, min: 0 },
    manualScore: { type: Number, default: null, min: 0 },
    maxScore: { type: Number, default: null, min: 0 },
    isAutoGraded: { type: Boolean, default: false },
    gradingStatus: {
      type: String,
      enum: ["not_applicable", "auto_graded", "pending_manual", "partially_graded", "manually_overridden"],
      default: "not_applicable",
    },
    startedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    timeSpentSeconds: { type: Number, default: null, min: 0 },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    content: {
      type: String,
      trim: true,
      default: "",
    },

    attachments: [
      {
        type: String,
        trim: true,
      },
    ],

    score: {
      type: Number,
      default: null,
      min: 0,
    },

    feedback: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["submitted", "graded", "returned"],
      default: "submitted",
    },
  },
  {
    timestamps: true,
  }
);

// A student should normally have only one submission per assignment
assignmentSubmissionSchema.index(
  {
    assignment: 1,
    student: 1,
  },
  {
    unique: true,
  }
);

const AssignmentSubmission = mongoose.model(
  "AssignmentSubmission",
  assignmentSubmissionSchema
);

export default AssignmentSubmission;