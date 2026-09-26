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
      required: true,
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
       default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================
// PAYSTACK TRANSACTION ID
// ============================================================
//
// A Paystack transaction can belong to only one payment.
// sparse allows multiple documents where the value is null.
//

paymentSchema.index(
  {
    paystackTransactionId: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

// ============================================================
// SCHOOL FEE PAYMENTS
// ============================================================
//
// Prevent multiple pending Paystack payments for the same
// student fee account.
//

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

// ============================================================
// INITIAL SUBSCRIPTION PAYMENTS
// ============================================================
//
// IMPORTANT:
//
// An initial subscription payment does NOT have a subscription
// yet because the subscription is created only after successful
// payment.
//
// Therefore we cannot use:
//
//   school + subscription + type
//
// for initial subscriptions.
//
// Instead, there can only be one unfinished initial subscription
// payment for a school/session/term.
//

paymentSchema.index(
  {
    school: 1,
    academicSession: 1,
    academicTerm: 1,
    type: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      type: "initial_subscription",
      status: "pending",
      provider: "paystack",
    },
  }
);

// ============================================================
// ADDITIONAL SEAT PAYMENTS
// ============================================================
//
// Additional-seat payments DO have an existing subscription.
//
// Prevent multiple unfinished Paystack additional-seat payments
// for the same subscription.
//

paymentSchema.index(
  {
    school: 1,
    subscription: 1,
    type: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      type: "additional_seats",
      subscription: {
        $type: "objectId",
      },
      status: "pending",
      provider: "paystack",
    },
  }
);

const Payment = mongoose.model(
  "Payment",
  paymentSchema
);

export default Payment;