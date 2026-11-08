import mongoose from "mongoose";

const optionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  value: { type: String, required: true, trim: true, maxlength: 300 },
}, { _id: false });

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true, maxlength: 5000 },
  type: { type: String, enum: ["multiple_choice", "true_false", "short_answer", "essay"], required: true },
  options: { type: [optionSchema], default: [] },
  correctAnswer: { type: String, trim: true, default: "" },
  acceptedAnswers: { type: [String], default: [] },
  explanation: { type: String, trim: true, default: "", maxlength: 10000 },
  marks: { type: Number, required: true, min: 0.01 },
  order: { type: Number, default: 0 },
});

const examSchema = new mongoose.Schema({
  school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, index: true },
  academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
  academicTerm: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicTerm", required: true },
  schoolClass: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass", required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  subjectAssignment: { type: mongoose.Schema.Types.ObjectId, ref: "SubjectAssignment", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  instructions: { type: String, trim: true, default: "", maxlength: 5000 },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  durationMinutes: { type: Number, required: true, min: 1, max: 300 },
  totalMarks: { type: Number, required: true, min: 0.01 },
  questions: { type: [questionSchema], validate: v => Array.isArray(v) && v.length > 0 },
  shuffleQuestions: { type: Boolean, default: false },
  showResultsImmediately: { type: Boolean, default: false },
  status: { type: String, enum: ["draft", "published", "closed"], default: "draft", index: true },
}, { timestamps: true });

examSchema.index({ school: 1, schoolClass: 1, academicTerm: 1, status: 1 });
examSchema.index({ createdBy: 1, status: 1 });
export default mongoose.model("Exam", examSchema);
