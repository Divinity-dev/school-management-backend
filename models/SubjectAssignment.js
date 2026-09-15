import mongoose from "mongoose";

const subjectAssignmentSchema = new mongoose.Schema(
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

    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

subjectAssignmentSchema.index(
  {
    school: 1,
    academicSession: 1,
    schoolClass: 1,
    subject: 1,
  },
  {
    unique: true,
  }
);

const SubjectAssignment = mongoose.model(
  "SubjectAssignment",
  subjectAssignmentSchema
);

export default SubjectAssignment;