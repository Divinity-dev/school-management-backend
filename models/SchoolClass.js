import mongoose from "mongoose";

const schoolClassSchema = new mongoose.Schema(
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

    name: {
      type: String,
      required: true,
      trim: true,
    },

    arm: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    section: {
      type: String,
      trim: true,
      enum: [
        "Nursery",
        "Primary",
        "Junior Secondary",
        "Senior Secondary",
      ],
      required: true,
    },

    classTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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

// A school cannot have two identical classes
// within the same academic session.
schoolClassSchema.index(
  {
    school: 1,
    academicSession: 1,
    name: 1,
    arm: 1,
  },
  {
    unique: true,
  }
);

const SchoolClass = mongoose.model(
  "SchoolClass",
  schoolClassSchema
);

export default SchoolClass;