import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    academicSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
    },

    term: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicTerm",
      required: true,
    },

    schoolClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolClass",
      required: true,
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },

    subjectAssignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubjectAssignment",
      required: true,
    },

    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 5000,
    },

    instructions: {
      type: String,
      trim: true,
      default: "",
      maxlength: 5000,
    },

    dueDate: {
      type: Date,
      required: true,
    },

    attachmentUrl: {
      type: String,
      trim: true,
      default: "",
    },

    attachmentName: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["draft", "published", "closed"],
      default: "draft",
    },
  },
  {
    timestamps: true,
  }
);

assignmentSchema.index({
  school: 1,
  academicSession: 1,
  term: 1,
  schoolClass: 1,
  subject: 1,
});

assignmentSchema.index({
  teacher: 1,
  status: 1,
});

assignmentSchema.index({
  schoolClass: 1,
  term: 1,
  status: 1,
});

const Assignment = mongoose.model(
  "Assignment",
  assignmentSchema
);

export default Assignment;

