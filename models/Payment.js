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
      default: null,
      index: true,
    },

    studentFeeAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentFeeAccount",
      default: null,
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

    type: {
      type: String,
      enum: [
        "initial_subscription",
        "additional_seats",
        "renewal",
        "school_fees",
      ],
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    studentSeatsPurchased: {
      type: Number,
      default: null,
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
      enum: ["paystack", "offline"],
      default: "paystack",
    },

    paymentMethod: {
      type: String,
      enum: [
        "paystack",
        "cash",
        "bank_transfer",
        "pos",
        "other",
      ],
      default: "paystack",
    },

    paystackTransactionId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "successful",
        "failed",
        "cancelled",
      ],
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

// A Paystack transaction must belong to only one payment.
// sparse allows multiple null values.
paymentSchema.index(
  { paystackTransactionId: 1 },
  {
    unique: true,
    sparse: true,
  }
);

// Prevent multiple unfinished Paystack school-fee payments
// for the same fee account.
paymentSchema.index(
  {
    school: 1,
    studentFeeAccount: 1,
    type: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      type: "school_fees",
      status: "pending",
      provider: "paystack",
    },
  }
);

// Prevent multiple unfinished subscription payments
// for the same subscription.
paymentSchema.index(
  {
    school: 1,
    subscription: 1,
    type: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      subscription: { $type: "objectId" },
      status: "pending",
      provider: "paystack",
    },
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;