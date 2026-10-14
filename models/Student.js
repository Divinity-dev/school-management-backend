
import mongoose from "mongoose";
import {
  normalizeStudentId,
  isValidStudentId,
} from "../utils/normalizeStudentId.js";

const studentSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    studentId: {
      type: String,
      required: true,
      trim: true,
      set: normalizeStudentId,
      validate: {
        validator: isValidStudentId,
        message:
          "Student ID must follow the format STU-0001.",
      },
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    middleName: {
      type: String,
      trim: true,
      default: "",
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    dateOfBirth: {
      type: Date,
      required: true,
    },

    gender: {
      type: String,
      enum: ["Male", "Female"],
      required: true,
    },

    admissionDate: {
      type: Date,
      required: true,
    },

    profileImage: {
      type: String,
      default: "",
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

    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    phone: {
      type: String,
      trim: true,
      default: "",
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

// Student IDs must be unique within each school.
studentSchema.index(
  { school: 1, studentId: 1 },
  { unique: true }
);

// A portal account can belong to only one student.
studentSchema.index(
  { user: 1 },
  {
    unique: true,
    partialFilterExpression: {
      user: { $type: "objectId" },
    },
  }
);

const Student = mongoose.model("Student", studentSchema);

export default Student;
