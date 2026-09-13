import crypto from "crypto";

import Payment from "../models/Payment.js";
import Subscription from "../models/Subscription.js";

import {
  initializeTransaction,
  verifyTransaction,
} from "../utils/paystack.js";

const PRICE_PER_STUDENT = 1000;

const getSchoolId = (req) => {
  return req.user?.school?._id || req.user?.school;
};

// --------------------------------------------------
// Initialize subscription payment
// --------------------------------------------------
export const initializeSubscriptionPayment = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const { subscriptionId } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        message: "User is not associated with a school.",
      });
    }

    if (!subscriptionId) {
      return res.status(400).json({
        message: "Subscription ID is required.",
      });
    }

    // --------------------------------------------------
    // Find subscription and verify school ownership
    // --------------------------------------------------
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      school: schoolId,
    });

    if (!subscription) {
      return res.status(404).json({
        message: "Subscription not found.",
      });
    }

    // --------------------------------------------------
    // Payment is only allowed for pending subscriptions
    // --------------------------------------------------
    if (subscription.status !== "pending") {
      return res.status(400).json({
        message:
          "Payment can only be initialized for a pending subscription.",
      });
    }

    // --------------------------------------------------
    // Recalculate the expected amount
    // Never trust the stored amount blindly
    // --------------------------------------------------
    const expectedAmount =
      Number(subscription.studentLimit) * PRICE_PER_STUDENT;

    if (Number(subscription.amount) !== expectedAmount) {
      return res.status(400).json({
        message:
          "Subscription amount does not match the current pricing.",
      });
    }

    // --------------------------------------------------
    // Get authenticated user's email
    // --------------------------------------------------
    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        message:
          "Authenticated user's email is required for payment.",
      });
    }

    // --------------------------------------------------
    // Check for an existing pending payment
    // --------------------------------------------------
    const existingPayment = await Payment.findOne({
      subscription: subscription._id,
      status: "pending",
    });

    if (existingPayment) {
      return res.status(200).json({
        message: "A pending payment already exists for this subscription.",
        payment: {
          id: existingPayment._id,
          reference: existingPayment.paymentReference,
          amount: existingPayment.amount,
          studentSeatsPurchased:
            existingPayment.studentSeatsPurchased,
          status: existingPayment.status,
        },
      });
    }

    // --------------------------------------------------
    // Generate unique payment reference
    // --------------------------------------------------
    const paymentReference = `SCH-${Date.now()}-${crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase()}`;

    // --------------------------------------------------
    // Create payment record
    // --------------------------------------------------
    const payment = await Payment.create({
      school: schoolId,
      subscription: subscription._id,
      academicSession: subscription.academicSession,
      academicTerm: subscription.academicTerm,
      type: "initial_subscription",
      amount: expectedAmount,
      studentSeatsPurchased: subscription.studentLimit,
      paymentReference,
      provider: "paystack",
      status: "pending",
      metadata: {
        pricePerStudent: PRICE_PER_STUDENT,
        studentLimit: subscription.studentLimit,
      },
    });

    // --------------------------------------------------
    // Paystack expects amount in kobo
    // ₦100,000 = 10,000,000 kobo
    // --------------------------------------------------
    const amountInKobo = Math.round(expectedAmount * 100);

    // --------------------------------------------------
    // Initialize transaction with Paystack
    // --------------------------------------------------
    const paystackTransaction = await initializeTransaction({
      email,
      amount: amountInKobo,
      reference: paymentReference,
      callbackUrl: process.env.PAYSTACK_CALLBACK_URL,
      metadata: {
        paymentId: payment._id.toString(),
        subscriptionId: subscription._id.toString(),
        schoolId: schoolId.toString(),
        type: "initial_subscription",
        studentSeatsPurchased: subscription.studentLimit,
      },
    });

    return res.status(200).json({
      message: "Subscription payment initialized successfully.",
      payment: {
        id: payment._id,
        reference: payment.paymentReference,
        amount: payment.amount,
        studentSeatsPurchased:
          payment.studentSeatsPurchased,
        status: payment.status,
      },
      paystack: {
        authorizationUrl:
          paystackTransaction.authorization_url,
        accessCode: paystackTransaction.access_code,
        reference: paystackTransaction.reference,
      },
    });
  } catch (error) {
    console.error(
      "Initialize subscription payment error:",
      error
    );

    return res.status(500).json({
      message: "Failed to initialize subscription payment.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Verify subscription payment
// --------------------------------------------------
export const verifySubscriptionPayment = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const { reference } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        message: "User is not associated with a school.",
      });
    }

    if (!reference) {
      return res.status(400).json({
        message: "Payment reference is required.",
      });
    }

    // --------------------------------------------------
    // Find payment belonging to this school
    // --------------------------------------------------
    const payment = await Payment.findOne({
      paymentReference: reference,
      school: schoolId,
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found.",
      });
    }

    // --------------------------------------------------
    // If already successful, don't process it again
    // --------------------------------------------------
    if (payment.status === "successful") {
      const subscription = await Subscription.findOne({
        _id: payment.subscription,
        school: schoolId,
      });

      return res.status(200).json({
        message: "Payment has already been verified successfully.",
        payment,
        subscription,
      });
    }

    // --------------------------------------------------
    // Verify transaction directly with Paystack
    // --------------------------------------------------
    const transaction = await verifyTransaction(reference);

    // --------------------------------------------------
    // Verify transaction reference
    // --------------------------------------------------
    if (transaction.reference !== payment.paymentReference) {
      return res.status(400).json({
        message: "Payment reference mismatch.",
      });
    }

    // --------------------------------------------------
    // Verify payment amount
    // Paystack amount is in kobo
    // --------------------------------------------------
    const expectedAmountInKobo = Math.round(
      Number(payment.amount) * 100
    );

    if (Number(transaction.amount) !== expectedAmountInKobo) {
      payment.status = "failed";

      payment.metadata = {
        ...(payment.metadata || {}),
        failureReason: "Payment amount mismatch.",
        paystackAmount: transaction.amount,
      };

      await payment.save();

      return res.status(400).json({
        message: "Payment amount does not match the expected amount.",
      });
    }

    // --------------------------------------------------
    // Confirm successful Paystack transaction
    // --------------------------------------------------
    if (transaction.status !== "success") {
      payment.status = "failed";

      payment.metadata = {
        ...(payment.metadata || {}),
        paystackStatus: transaction.status,
        failureReason: "Paystack transaction was not successful.",
      };

      await payment.save();

      return res.status(400).json({
        message: "Payment was not successful.",
        status: transaction.status,
      });
    }

    // --------------------------------------------------
    // Find the subscription
    // --------------------------------------------------
    const subscription = await Subscription.findOne({
      _id: payment.subscription,
      school: schoolId,
    });

    if (!subscription) {
      return res.status(404).json({
        message:
          "Subscription associated with this payment was not found.",
      });
    }

    // --------------------------------------------------
    // Verify subscription amount again
    // --------------------------------------------------
    const expectedSubscriptionAmount =
      Number(subscription.studentLimit) * PRICE_PER_STUDENT;

    if (
      Number(subscription.amount) !==
      expectedSubscriptionAmount
    ) {
      return res.status(400).json({
        message:
          "Subscription amount does not match the current pricing.",
      });
    }

    // --------------------------------------------------
    // Mark payment as successful
    // --------------------------------------------------
    payment.status = "successful";
    payment.paidAt = new Date();

    payment.metadata = {
      ...(payment.metadata || {}),
      paystackTransactionId: transaction.id,
      paystackStatus: transaction.status,
      channel: transaction.channel,
      currency: transaction.currency,
      customerEmail: transaction.customer?.email,
    };

    await payment.save();

    // --------------------------------------------------
    // Activate subscription
    // --------------------------------------------------
    subscription.status = "active";
    subscription.activatedAt = new Date();

    await subscription.save();

    return res.status(200).json({
      message:
        "Payment verified and subscription activated successfully.",
      payment,
      subscription,
    });
  } catch (error) {
    console.error(
      "Verify subscription payment error:",
      error
    );

    return res.status(500).json({
      message: "Failed to verify subscription payment.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Handle Paystack webhook
// --------------------------------------------------
export const handlePaystackWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];

    if (!signature) {
      return res.status(400).json({
        message: "Paystack signature is missing.",
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.error("PAYSTACK_SECRET_KEY is not configured.");

      return res.status(500).json({
        message: "Payment configuration error.",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(req.body)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(401).json({
        message: "Invalid Paystack signature.",
      });
    }

    const event = JSON.parse(req.body.toString("utf8"));

    console.log("Paystack webhook received:", event.event);

    // We currently care about successful charges.
    if (event.event !== "charge.success") {
      return res.status(200).json({
        message: "Webhook received.",
      });
    }

    const transaction = event.data;

    if (!transaction?.reference) {
      return res.status(400).json({
        message: "Payment reference is missing.",
      });
    }

    const payment = await Payment.findOne({
      paymentReference: transaction.reference,
    });

    if (!payment) {
      console.warn(
        `Payment not found for Paystack reference: ${transaction.reference}`
      );

      // Return 200 so Paystack doesn't repeatedly retry a payment
      // that doesn't exist in our database.
      return res.status(200).json({
        message: "Payment not found. Webhook acknowledged.",
      });
    }

    // Idempotency:
    // If we already processed this payment, do nothing.
    if (payment.status === "successful") {
      return res.status(200).json({
        message: "Payment already processed.",
      });
    }

    // Verify the amount sent by Paystack.
    const expectedAmountInKobo = Math.round(
      Number(payment.amount) * 100
    );

    if (Number(transaction.amount) !== expectedAmountInKobo) {
      payment.status = "failed";

      payment.metadata = {
        ...(payment.metadata || {}),
        failureReason: "Webhook payment amount mismatch.",
        paystackAmount: transaction.amount,
      };

      await payment.save();

      return res.status(400).json({
        message: "Payment amount does not match.",
      });
    }

    // We only activate subscriptions for successful transactions.
    if (transaction.status !== "success") {
      payment.status = "failed";

      payment.metadata = {
        ...(payment.metadata || {}),
        paystackStatus: transaction.status,
        failureReason:
          "Paystack webhook transaction was not successful.",
      };

      await payment.save();

      return res.status(200).json({
        message: "Unsuccessful payment webhook processed.",
      });
    }

    const subscription = await Subscription.findById(
      payment.subscription
    );

    if (!subscription) {
      console.error(
        `Subscription ${payment.subscription} not found for payment ${payment._id}`
      );

      return res.status(500).json({
        message: "Associated subscription not found.",
      });
    }

    // Make sure the subscription amount still matches our pricing.
    const expectedSubscriptionAmount =
      Number(subscription.studentLimit) * PRICE_PER_STUDENT;

    if (
      Number(subscription.amount) !==
      expectedSubscriptionAmount
    ) {
      console.error(
        `Subscription amount mismatch for subscription ${subscription._id}`
      );

      return res.status(400).json({
        message: "Subscription amount does not match current pricing.",
      });
    }

    // Mark payment successful.
    payment.status = "successful";
    payment.paidAt = new Date();

    payment.metadata = {
      ...(payment.metadata || {}),
      paystackTransactionId: transaction.id,
      paystackStatus: transaction.status,
      channel: transaction.channel,
      currency: transaction.currency,
      customerEmail: transaction.customer?.email,
    };

    await payment.save();

    // Activate subscription.
    if (subscription.status !== "active") {
      subscription.status = "active";
      subscription.activatedAt = new Date();

      await subscription.save();
    }

    console.log(
      `Payment ${payment.paymentReference} processed successfully.`
    );

    return res.status(200).json({
      message: "Paystack webhook processed successfully.",
    });
  } catch (error) {
    console.error("Paystack webhook error:", error);

    return res.status(500).json({
      message: "Failed to process Paystack webhook.",
    });
  }
};

