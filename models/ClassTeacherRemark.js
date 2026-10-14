import mongoose from "mongoose";

const attendanceOverrideSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    present: { type: Number, min: 0, default: 0 },
    absent: { type: Number, min: 0, default: 0 },
    late: { type: Number, min: 0, default: 0 },
    excused: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const classTeacherRemarkSchema = new mongoose.Schema(
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
    remark: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    attendanceOverride: {
      type: attendanceOverrideSchema,
      default: () => ({ enabled: false }),
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

classTeacherRemarkSchema.index(
  {
    school: 1,
    student: 1,
    schoolClass: 1,
    academicSession: 1,
    academicTerm: 1,
  },
  { unique: true }
);

const ClassTeacherRemark = mongoose.model(
  "ClassTeacherRemark",
  classTeacherRemarkSchema
);

export default ClassTeacherRemark;