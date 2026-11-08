import mongoose from "mongoose";

const examSubmissionSchema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
  questionOrder: { type: [{ type: mongoose.Schema.Types.ObjectId }], default: [] },
  answers: [{ questionId: { type: mongoose.Schema.Types.ObjectId, required: true }, answer: { type: String, default: "" } }],
  startedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  submittedAt: { type: Date, default: null },
  timeSpentSeconds: { type: Number, default: null, min: 0 },
  autoScore: { type: Number, default: 0, min: 0 },
  manualScore: { type: Number, default: null, min: 0 },
  score: { type: Number, default: null, min: 0 },
  maxScore: { type: Number, required: true, min: 0 },
  percentage: { type: Number, default: null, min: 0, max: 100 },
  gradingStatus: { type: String, enum: ["in_progress", "pending_manual", "graded"], default: "in_progress" },
  status: { type: String, enum: ["in_progress", "submitted", "graded"], default: "in_progress" },
  resultSynced: { type: Boolean, default: false },
}, { timestamps: true });

examSubmissionSchema.index({ exam: 1, student: 1 }, { unique: true });
examSubmissionSchema.index({ school: 1, student: 1, status: 1 });
export default mongoose.model("ExamSubmission", examSubmissionSchema);
