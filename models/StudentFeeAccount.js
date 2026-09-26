import mongoose from "mongoose";

const studentFeeAccountSchema = new mongoose.Schema(
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

    feeStructure: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeStructure",
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

    totalAmountDue: {
      type: Number,
      required: true,
      min: 0,
    },

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    balance: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// A student should have only one fee account
// for a particular fee structure.
studentFeeAccountSchema.index(
  {
    school: 1,
    student: 1,
    feeStructure: 1,
  },
  {
    unique: true,
  }
);

const StudentFeeAccount = mongoose.model(
  "StudentFeeAccount",
  studentFeeAccountSchema
);

export default StudentFeeAccount;