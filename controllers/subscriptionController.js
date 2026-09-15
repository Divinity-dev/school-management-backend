import mongoose from "mongoose";
import crypto from "crypto";

import Subscription from "../models/Subscription.js";
import Payment from "../models/Payment.js";
import Student from "../models/Student.js";
import AcademicSession from "../models/AcademicSession.js";
import AcademicTerm from "../models/AcademicTerm.js";

import {
  initializeTransaction,
  verifyTransaction,
} from "../utils/paystack.js";

const PRICE_PER_STUDENT = 1000;

const getSchoolId = (req) => {
  return req.user?.school?._id || req.user?.school;
};

// --------------------------------------------------
// Create a subscription
// --------------------------------------------------
export const createSubscription = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const {
      academicSessionId,
      academicTermId,
      studentLimit,
    } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        message: "User is not associated with a school.",
      });
    }

    if (!academicSessionId || !academicTermId) {
      return res.status(400).json({
        message: "Academic session and academic term are required.",
      });
    }

    if (!studentLimit || studentLimit < 1) {
      return res.status(400).json({
        message: "Student limit must be at least 1.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(academicSessionId) ||
      !mongoose.Types.ObjectId.isValid(academicTermId)
    ) {
      return res.status(400).json({
        message: "Invalid academic session or academic term ID.",
      });
    }

    const calculatedAmount =
      Number(studentLimit) * PRICE_PER_STUDENT;

    // --------------------------------------------------
    // Verify session belongs to this school
    // --------------------------------------------------
    const academicSession = await AcademicSession.findOne({
      _id: academicSessionId,
      school: schoolId,
    });

    if (!academicSession) {
      return res.status(404).json({
        message: "Academic session not found for this school.",
      });
    }

    // --------------------------------------------------
    // Verify term belongs to this school and session
    // --------------------------------------------------
    const academicTerm = await AcademicTerm.findOne({
      _id: academicTermId,
      school: schoolId,
      academicSession: academicSessionId,
    });

    if (!academicTerm) {
      return res.status(404).json({
        message:
          "Academic term not found for this school and academic session.",
      });
    }

    // --------------------------------------------------
    // Prevent duplicate subscription
    // --------------------------------------------------
    const existingSubscription = await Subscription.findOne({
      school: schoolId,
      academicSession: academicSessionId,
      academicTerm: academicTermId,
    });

    if (existingSubscription) {
      return res.status(409).json({
        message:
          "A subscription already exists for this academic term.",
        subscription: existingSubscription,
      });
    }

    // --------------------------------------------------
    // Create pending subscription
    // --------------------------------------------------
    const subscription = await Subscription.create({
      school: schoolId,
      academicSession: academicSessionId,
      academicTerm: academicTermId,
      studentLimit: Number(studentLimit),
      amount: calculatedAmount,
      status: "pending",
      startsAt: academicTerm.startDate,
      expiresAt: academicTerm.endDate,
    });

    return res.status(201).json({
      message: "Subscription created successfully.",
      subscription,
      pricing: {
        pricePerStudent: PRICE_PER_STUDENT,
        studentLimit: Number(studentLimit),
        totalAmount: calculatedAmount,
      },
    });
  } catch (error) {
    console.error("Create subscription error:", error);

    return res.status(500).json({
      message: "Failed to create subscription.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Initialize subscription payment
// --------------------------------------------------
export const initializeSubscriptionPayment = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { subscriptionId } = req.body;

    const userEmail = req.user?.email;

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

    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      return res.status(400).json({
        message: "Invalid subscription ID.",
      });
    }

    if (!userEmail) {
      return res.status(400).json({
        message: "Authenticated user email is required for payment.",
      });
    }

    // --------------------------------------------------
    // Find subscription belonging to this school
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
    // Subscription must still be pending
    // --------------------------------------------------
    if (subscription.status !== "pending") {
      return res.status(400).json({
        message:
          "Only a pending subscription can be paid for.",
        status: subscription.status,
      });
    }

    // --------------------------------------------------
    // Prevent duplicate successful payment
    // --------------------------------------------------
    const successfulPayment = await Payment.findOne({
      subscription: subscription._id,
      type: "initial_subscription",
      status: "successful",
    });

    if (successfulPayment) {
      return res.status(409).json({
        message: "This subscription has already been paid for.",
        payment: successfulPayment,
      });
    }

    // --------------------------------------------------
    // Prevent multiple active pending payment attempts
    // --------------------------------------------------
    const pendingPayment = await Payment.findOne({
      subscription: subscription._id,
      type: "initial_subscription",
      status: "pending",
    });

    if (pendingPayment) {
      return res.status(409).json({
        message:
          "A payment is already pending for this subscription.",
        payment: pendingPayment,
      });
    }

    // --------------------------------------------------
    // Generate unique application payment reference
    // --------------------------------------------------
    const paymentReference = `SUB-${Date.now()}-${crypto
      .randomBytes(6)
      .toString("hex")
      .toUpperCase()}`;

    // --------------------------------------------------
    // Amount is stored in NAIRA in our database
    // Paystack requires KOBO
    // --------------------------------------------------
    const amountInNaira = Number(subscription.amount);
    const amountInKobo = amountInNaira * 100;

    if (!Number.isFinite(amountInNaira) || amountInNaira <= 0) {
      return res.status(400).json({
        message: "Invalid subscription amount.",
      });
    }

    // --------------------------------------------------
    // Create pending payment record
    // --------------------------------------------------
    const payment = await Payment.create({
      school: schoolId,
      subscription: subscription._id,
      academicSession: subscription.academicSession,
      academicTerm: subscription.academicTerm,
      type: "initial_subscription",
      amount: amountInNaira,
      studentSeatsPurchased: subscription.studentLimit,
      paymentReference,
      provider: "paystack",
      status: "pending",
      metadata: {
        subscriptionId: subscription._id.toString(),
        studentSeats: subscription.studentLimit,
        amountInNaira,
      },
    });

    // --------------------------------------------------
    // Paystack callback URL
    // --------------------------------------------------
    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;

    if (!callbackUrl) {
      await Payment.findByIdAndDelete(payment._id);

      return res.status(500).json({
        message: "PAYSTACK_CALLBACK_URL is not configured.",
      });
    }

    // --------------------------------------------------
    // Initialize Paystack transaction
    // --------------------------------------------------
    const paystackTransaction = await initializeTransaction({
      email: userEmail,
      amount: amountInKobo,
      reference: paymentReference,
      callbackUrl,
      metadata: {
        paymentId: payment._id.toString(),
        subscriptionId: subscription._id.toString(),
        schoolId: schoolId.toString(),
        academicSessionId:
          subscription.academicSession.toString(),
        academicTermId:
          subscription.academicTerm.toString(),
        type: "initial_subscription",
      },
    });

    return res.status(200).json({
      message: "Subscription payment initialized successfully.",
      payment: {
        id: payment._id,
        reference: payment.paymentReference,
        amount: payment.amount,
        currency: "NGN",
        status: payment.status,
      },
      paystack: {
        authorizationUrl: paystackTransaction.authorization_url,
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
    // Find our payment record
    // --------------------------------------------------
    const payment = await Payment.findOne({
      paymentReference: reference,
      school: schoolId,
      type: "initial_subscription",
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment record not found.",
      });
    }

    // --------------------------------------------------
    // Idempotency
    // If already successful, don't process again
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
    // Verify reference
    // --------------------------------------------------
    if (transaction.reference !== payment.paymentReference) {
      payment.status = "failed";
      await payment.save();

      return res.status(400).json({
        message: "Payment reference mismatch.",
      });
    }

    // --------------------------------------------------
    // Verify transaction status
    // --------------------------------------------------
    if (transaction.status !== "success") {
      payment.status = "failed";
      await payment.save();

      return res.status(400).json({
        message: "Paystack transaction was not successful.",
        paymentStatus: transaction.status,
      });
    }

    // --------------------------------------------------
    // Verify currency
    // --------------------------------------------------
    if (transaction.currency !== "NGN") {
      payment.status = "failed";
      await payment.save();

      return res.status(400).json({
        message: "Invalid payment currency.",
      });
    }

    // --------------------------------------------------
    // Verify amount
    //
    // Our database stores naira.
    // Paystack returns kobo.
    // --------------------------------------------------
    const expectedAmountInKobo =
      Number(payment.amount) * 100;

    if (Number(transaction.amount) !== expectedAmountInKobo) {
      payment.status = "failed";
      await payment.save();

      return res.status(400).json({
        message: "Payment amount mismatch.",
        expectedAmount: expectedAmountInKobo,
        receivedAmount: transaction.amount,
      });
    }

    // --------------------------------------------------
    // Find subscription
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
    // Activate subscription
    // --------------------------------------------------
    subscription.status = "active";
    subscription.activatedAt = new Date();

    await subscription.save();

    // --------------------------------------------------
    // Update payment
    // --------------------------------------------------
    payment.status = "successful";
    payment.paidAt = new Date();
    payment.paystackTransactionId =
      transaction.id?.toString() || null;

    payment.metadata = {
      ...(payment.metadata || {}),
      paystackStatus: transaction.status,
      paystackCurrency: transaction.currency,
      paystackAmount: transaction.amount,
      channel: transaction.channel,
      paidAt: transaction.paid_at || null,
    };

    await payment.save();

    return res.status(200).json({
      message: "Subscription payment verified successfully.",
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
// Get subscription for a specific term
// --------------------------------------------------
export const getTermSubscription = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const { academicSessionId, academicTermId } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        message: "User is not associated with a school.",
      });
    }

    if (!academicSessionId || !academicTermId) {
      return res.status(400).json({
        message:
          "Academic session ID and academic term ID are required.",
      });
    }

    const subscription = await Subscription.findOne({
      school: schoolId,
      academicSession: academicSessionId,
      academicTerm: academicTermId,
    })
      .populate("academicSession", "name startDate endDate")
      .populate(
        "academicTerm",
        "name startDate endDate isCurrent isActive"
      );

    if (!subscription) {
      return res.status(404).json({
        message: "No subscription found for this academic term.",
      });
    }

    const activeStudentCount = await Student.countDocuments({
      school: schoolId,
      isActive: true,
    });

    const availableSeats = Math.max(
      subscription.studentLimit - activeStudentCount,
      0
    );

    return res.status(200).json({
      message: "Subscription retrieved successfully.",
      subscription,
      usage: {
        studentLimit: subscription.studentLimit,
        activeStudents: activeStudentCount,
        availableSeats,
      },
    });
  } catch (error) {
    console.error("Get term subscription error:", error);

    return res.status(500).json({
      message: "Failed to retrieve subscription.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Get current term subscription
// --------------------------------------------------
export const getCurrentSubscription = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "User is not associated with a school.",
      });
    }

    const currentTerm = await AcademicTerm.findOne({
      school: schoolId,
      isCurrent: true,
      isActive: true,
    });

    if (!currentTerm) {
      return res.status(404).json({
        message: "No current academic term found.",
      });
    }

    const subscription = await Subscription.findOne({
      school: schoolId,
      academicSession: currentTerm.academicSession,
      academicTerm: currentTerm._id,
    })
      .populate("academicSession", "name startDate endDate")
      .populate(
        "academicTerm",
        "name startDate endDate isCurrent isActive"
      );

    const activeStudentCount = await Student.countDocuments({
      school: schoolId,
      isActive: true,
    });

    if (!subscription) {
      return res.status(200).json({
        message: "No active subscription found for the current term.",
        subscription: null,
        currentTerm,
        usage: {
          studentLimit: 0,
          activeStudents: activeStudentCount,
          availableSeats: 0,
        },
        isSubscribed: false,
      });
    }

    const isSubscriptionActive =
      subscription.status === "active" &&
      (!subscription.expiresAt ||
        new Date(subscription.expiresAt) >= new Date());

    const availableSeats = Math.max(
      subscription.studentLimit - activeStudentCount,
      0
    );

    return res.status(200).json({
      message: "Current subscription retrieved successfully.",
      subscription,
      currentTerm,
      usage: {
        studentLimit: subscription.studentLimit,
        activeStudents: activeStudentCount,
        availableSeats,
      },
      isSubscribed: isSubscriptionActive,
    });
  } catch (error) {
    console.error("Get current subscription error:", error);

    return res.status(500).json({
      message: "Failed to retrieve current subscription.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Check subscription status
// --------------------------------------------------
export const checkSubscriptionStatus = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const { academicSessionId, academicTermId } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        message: "User is not associated with a school.",
      });
    }

    if (!academicSessionId || !academicTermId) {
      return res.status(400).json({
        message:
          "Academic session ID and academic term ID are required.",
      });
    }

    const subscription = await Subscription.findOne({
      school: schoolId,
      academicSession: academicSessionId,
      academicTerm: academicTermId,
    });

    if (!subscription) {
      return res.status(200).json({
        isSubscribed: false,
        status: "not_subscribed",
        studentLimit: 0,
        activeStudents: await Student.countDocuments({
          school: schoolId,
          isActive: true,
        }),
        availableSeats: 0,
      });
    }

    const activeStudentCount = await Student.countDocuments({
      school: schoolId,
      isActive: true,
    });

    const isActive =
      subscription.status === "active" &&
      (!subscription.expiresAt ||
        new Date(subscription.expiresAt) >= new Date());

    const availableSeats = Math.max(
      subscription.studentLimit - activeStudentCount,
      0
    );

    return res.status(200).json({
      isSubscribed: isActive,
      status: subscription.status,
      subscriptionId: subscription._id,
      studentLimit: subscription.studentLimit,
      activeStudents: activeStudentCount,
      availableSeats,
      expiresAt: subscription.expiresAt,
    });
  } catch (error) {
    console.error("Check subscription status error:", error);

    return res.status(500).json({
      message: "Failed to check subscription status.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Initialize additional student seats payment
// --------------------------------------------------
export const initializeAdditionalSeatsPayment = async (
  req,
  res
) => {
  try {
    const schoolId = getSchoolId(req);
    const userEmail = req.user?.email;

    const {
      subscriptionId,
      additionalSeats,
    } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        message: "User is not associated with a school.",
      });
    }

    if (!userEmail) {
      return res.status(400).json({
        message:
          "Authenticated user email is required for payment.",
      });
    }

    if (!subscriptionId) {
      return res.status(400).json({
        message: "Subscription ID is required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      return res.status(400).json({
        message: "Invalid subscription ID.",
      });
    }

    if (
      !Number.isInteger(additionalSeats) ||
      additionalSeats < 1
    ) {
      return res.status(400).json({
        message:
          "Additional seats must be a positive whole number.",
      });
    }

    // --------------------------------------------------
    // Find active subscription belonging to this school
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

    if (subscription.status !== "active") {
      return res.status(400).json({
        message:
          "Only an active subscription can have additional seats.",
        status: subscription.status,
      });
    }

    // --------------------------------------------------
    // Calculate amount on the backend
    // Never trust amount supplied by frontend
    // --------------------------------------------------
    const amountInNaira =
      Number(additionalSeats) * PRICE_PER_STUDENT;

    const amountInKobo = amountInNaira * 100;

    // --------------------------------------------------
    // Prevent duplicate pending additional-seat payment
    // --------------------------------------------------
    const pendingPayment = await Payment.findOne({
      subscription: subscription._id,
      type: "additional_seats",
      status: "pending",
    });

    if (pendingPayment) {
      return res.status(409).json({
        message:
          "An additional-seat payment is already pending for this subscription.",
        payment: pendingPayment,
      });
    }

    // --------------------------------------------------
    // Generate payment reference
    // --------------------------------------------------
    const paymentReference = `SEAT-${Date.now()}-${crypto
      .randomBytes(6)
      .toString("hex")
      .toUpperCase()}`;

    // --------------------------------------------------
    // Create pending payment record
    // --------------------------------------------------
    const payment = await Payment.create({
      school: schoolId,
      subscription: subscription._id,
      academicSession: subscription.academicSession,
      academicTerm: subscription.academicTerm,
      type: "additional_seats",
      amount: amountInNaira,
      studentSeatsPurchased: Number(additionalSeats),
      paymentReference,
      provider: "paystack",
      status: "pending",
      metadata: {
        subscriptionId: subscription._id.toString(),
        additionalSeats: Number(additionalSeats),
        previousStudentLimit: subscription.studentLimit,
        pricePerStudent: PRICE_PER_STUDENT,
        amountInNaira,
      },
    });

    // --------------------------------------------------
    // Paystack callback URL
    // --------------------------------------------------
    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;

    if (!callbackUrl) {
      await Payment.findByIdAndDelete(payment._id);

      return res.status(500).json({
        message: "PAYSTACK_CALLBACK_URL is not configured.",
      });
    }

    // --------------------------------------------------
    // Initialize Paystack transaction
    // --------------------------------------------------
    const paystackTransaction = await initializeTransaction({
      email: userEmail,
      amount: amountInKobo,
      reference: paymentReference,
      callbackUrl,
      metadata: {
        paymentId: payment._id.toString(),
        subscriptionId: subscription._id.toString(),
        schoolId: schoolId.toString(),
        academicSessionId:
          subscription.academicSession.toString(),
        academicTermId:
          subscription.academicTerm.toString(),
        type: "additional_seats",
        additionalSeats: Number(additionalSeats),
      },
    });

    return res.status(200).json({
      message:
        "Additional-seat payment initialized successfully.",
      payment: {
        id: payment._id,
        reference: payment.paymentReference,
        amount: payment.amount,
        currency: "NGN",
        studentSeatsPurchased:
          payment.studentSeatsPurchased,
        status: payment.status,
      },
      paystack: {
        authorizationUrl:
          paystackTransaction.authorization_url,
        accessCode:
          paystackTransaction.access_code,
        reference:
          paystackTransaction.reference,
      },
    });
  } catch (error) {
    console.error(
      "Initialize additional seats payment error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to initialize additional-seat payment.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Verify additional student seats payment
// --------------------------------------------------
export const verifyAdditionalSeatsPayment = async (
  req,
  res
) => {
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
    // Find our payment record
    // --------------------------------------------------
    const payment = await Payment.findOne({
      paymentReference: reference,
      school: schoolId,
      type: "additional_seats",
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment record not found.",
      });
    }

    // --------------------------------------------------
    // Find subscription
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
    // Idempotency
    // Prevent seats from being added twice
    // --------------------------------------------------
    if (payment.status === "successful") {
      return res.status(200).json({
        message:
          "Additional-seat payment has already been verified successfully.",
        payment,
        subscription,
      });
    }

    // --------------------------------------------------
    // Only pending payments can be verified
    // --------------------------------------------------
    if (payment.status !== "pending") {
      return res.status(400).json({
        message: `This payment is ${payment.status}.`,
        payment,
      });
    }

    // --------------------------------------------------
    // Verify transaction directly with Paystack
    // --------------------------------------------------
    const transaction = await verifyTransaction(reference);

    // --------------------------------------------------
    // Verify reference
    // --------------------------------------------------
    if (transaction.reference !== payment.paymentReference) {
      payment.status = "failed";
      await payment.save();

      return res.status(400).json({
        message: "Payment reference mismatch.",
      });
    }

    // --------------------------------------------------
    // Verify transaction status
    // --------------------------------------------------
    if (transaction.status !== "success") {
  // An abandoned checkout is not a failed payment.
  // Keep the payment pending so the customer can retry.
  if (transaction.status === "abandoned") {
    return res.status(400).json({
      message:
        "Payment was abandoned. No seats were added.",
      paymentStatus: transaction.status,
      payment,
    });
  }

  payment.status = "failed";
  await payment.save();

  return res.status(400).json({
    message:
      "Paystack transaction was not successful.",
    paymentStatus: transaction.status,
  });
}

    // --------------------------------------------------
    // Verify currency
    // --------------------------------------------------
    if (transaction.currency !== "NGN") {
      payment.status = "failed";
      await payment.save();

      return res.status(400).json({
        message: "Invalid payment currency.",
      });
    }

    // --------------------------------------------------
    // Verify amount
    // --------------------------------------------------
    const expectedAmountInKobo =
      Number(payment.amount) * 100;

    if (
      Number(transaction.amount) !==
      Number(expectedAmountInKobo)
    ) {
      payment.status = "failed";
      await payment.save();

      return res.status(400).json({
        message: "Payment amount mismatch.",
        expectedAmount: expectedAmountInKobo,
        receivedAmount: transaction.amount,
      });
    }

    // --------------------------------------------------
    // Add the seats ONLY after successful verification
    // --------------------------------------------------
    subscription.studentLimit +=
      Number(payment.studentSeatsPurchased);

    subscription.amount += Number(payment.amount);

    await subscription.save();

    // --------------------------------------------------
    // Mark payment successful
    // --------------------------------------------------
    payment.status = "successful";
    payment.paidAt = new Date();
    payment.paystackTransactionId =
      transaction.id?.toString() || null;

    payment.metadata = {
      ...(payment.metadata || {}),
      paystackStatus: transaction.status,
      paystackCurrency: transaction.currency,
      paystackAmount: transaction.amount,
      channel: transaction.channel,
      paidAt: transaction.paid_at || null,
      paystackTransactionId:
        transaction.id?.toString() || null,
    };

    await payment.save();

    return res.status(200).json({
      message:
        "Additional-seat payment verified successfully and seats added.",
      payment,
      subscription,
    });
  } catch (error) {
    console.error(
      "Verify additional seats payment error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to verify additional-seat payment.",
      error: error.message,
    });
  }
};

