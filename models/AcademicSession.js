import mongoose from "mongoose";

const academicSessionSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    name: {
      type: String,
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

academicSessionSchema.index({ school: 1, name: 1 }, { unique: true });

const AcademicSession = mongoose.model(
  "AcademicSession",
  academicSessionSchema
);

export default AcademicSession;