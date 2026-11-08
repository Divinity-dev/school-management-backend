import mongoose from "mongoose";

const questionOptionSchema = new mongoose.Schema({\n  text: { type: String, required: true, trim: true, maxlength: 1000 },\n  value: { type: String, required: true, trim: true },\n}, { _id: false });\n\nconst assessmentQuestionSchema = new mongoose.Schema({\n  question: { type: String, required: true, trim: true, maxlength: 5000 },\n  type: { type: String, enum: ["multiple_choice", "true_false", "short_answer", "essay"], required: true },\n  options: { type: [questionOptionSchema], default: [] },\n  correctAnswer: { type: String, trim: true, default: "" },\n  acceptedAnswers: { type: [String], default: [] },\n  marks: { type: Number, required: true, min: 0.01, default: 1 },\n  order: { type: Number, default: 0 },\n}, { _id: true });\n\nconst assignmentSchema = new mongoose.Schema(
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

