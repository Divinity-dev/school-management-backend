import mongoose from "mongoose";

const academicTermSchema = new mongoose.Schema(
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
      enum: ["First Term", "Second Term", "Third Term"],
      required: true,
      trim: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    isCurrent: {
      type: Boolean,
      default: false,
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

// A school can only have one First/Second/Third Term
// within a particular academic session.
academicTermSchema.index(
  {
    school: 1,
    academicSession: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

const AcademicTerm = mongoose.model(
  "AcademicTerm",
  academicTermSchema
);

export default AcademicTerm;