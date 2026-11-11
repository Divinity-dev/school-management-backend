import mongoose from "mongoose";

const optionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  value: { type: String, required: true, trim: true, maxlength: 100 },
}, { _id: false });

const questionBankQuestionSchema = new mongoose.Schema({
  school: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null, index: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
  schoolClass: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass", required: true, index: true },
  subjectAssignment: { type: mongoose.Schema.Types.ObjectId, ref: "SubjectAssignment", required: true },
  topic: { type: String, required: true, trim: true, maxlength: 200, index: true },
  question: { type: String, required: true, trim: true, maxlength: 5000 },
  type: { type: String, enum: ["multiple_choice", "true_false", "short_answer", "essay"], required: true },
  options: { type: [optionSchema], default: [] },
  correctAnswer: { type: String, trim: true, default: "" },
  acceptedAnswers: { type: [String], default: [] },
  explanation: { type: String, trim: true, default: "", maxlength: 10000 },
  marks: { type: Number, required: true, min: 1, default: 1, validate: Number.isInteger },
  difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium", index: true },
  source: { type: String, enum: ["manual", "ai", "import"], default: "manual" },
  visibility: { type: String, enum: ["school", "shared"], default: "school", index: true },
  status: { type: String, enum: ["approved", "archived"], default: "approved", index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

questionBankQuestionSchema.index({ school: 1, subject: 1, schoolClass: 1, topic: 1, status: 1 });
questionBankQuestionSchema.index({ question: "text", topic: "text" });

export default mongoose.model("QuestionBankQuestion", questionBankQuestionSchema);
