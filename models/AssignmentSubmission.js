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

    answers: {\n      type: [{\n        questionId: { type: mongoose.Schema.Types.ObjectId, required: true },\n        answer: { type: String, default: "" },\n      }],\n      default: [],\n    },\n\n    autoScore: { type: Number, default: null, min: 0 },\n    manualScore: { type: Number, default: null, min: 0 },\n    maxScore: { type: Number, default: null, min: 0 },\n    isAutoGraded: { type: Boolean, default: false },\n    gradingStatus: {\n      type: String,\n      enum: ["not_applicable", "auto_graded", "pending_manual", "partially_graded", "manually_overridden"],\n      default: "not_applicable",\n    },\n    startedAt: { type: Date, default: null },\n    expiresAt: { type: Date, default: null },\n    timeSpentSeconds: { type: Number, default: null, min: 0 },\n\n    submittedAt: {
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