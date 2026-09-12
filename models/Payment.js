import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true,
    },

    academicSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
    },

    academicTerm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicTerm",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "initial_subscription",
        "additional_seats",
        "renewal",
      ],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    studentSeatsPurchased: {
      type: Number,
      required: true,
      min: 1,
    },

    paymentReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    provider: {
      type: String,
      enum: ["paystack"],
      default: "paystack",
    },

    status: {
      type: String,
      enum: ["pending", "successful", "failed", "cancelled"],
      default: "pending",
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;