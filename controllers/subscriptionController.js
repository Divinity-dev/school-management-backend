import mongoose from "mongoose";
import crypto from "crypto";
import AcademicSession from "../models/AcademicSession.js";
import Subscription from "../models/Subscription.js";
import Payment from "../models/Payment.js";
import Student from "../models/Student.js";
import AcademicTerm from "../models/AcademicTerm.js";

import {
  initializeTransaction,
  verifyTransaction,
} from "../utils/paystack.js";

const PRICE_PER_STUDENT = 1000;

const getSchoolId = (req) => {
  return (
    req.user?.school?._id ||
    req.user?.school ||
    null
  );
};

const isValidObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(value);
};

const generatePaymentReference = (prefix) => {
  return `${prefix}-${Date.now()}-${crypto
    .randomBytes(6)
    .toString("hex")
    .toUpperCase()}`;
};

// --------------------------------------------------
// Get subscription pricing
// --------------------------------------------------
export const getSubscriptionPricing = async (req, res) => {
  try {
    return res.status(200).json({
      message: "Subscription pricing retrieved successfully.",
      pricing: {
        billingCycle: "termly",
        pricePerStudent: PRICE_PER_STUDENT,
        currency: "NGN",
        currencySymbol: "₦",
        minimumStudentSeats: 1,
      },
    });
  } catch (error) {
    console.error(
      "Get subscription pricing error:",
      error
    );

    return res.status(500).json({
      message: "Failed to retrieve subscription pricing.",
    });
  }
};

// --------------------------------------------------
// Initialize initial subscription payment
// --------------------------------------------------
//
// IMPORTANT:
// No Subscription document is created here.
//
// The Subscription is created only after Paystack
// confirms successful payment.
// --------------------------------------------------
export const initializeSubscriptionPayment = async (
  req,
  res
) => {
  try {
    const schoolId = getSchoolId(req);
    const userEmail = req.user?.email;

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

    if (!userEmail) {
      return res.status(400).json({
        message:
          "Authenticated user email is required for payment.",
      });
    }

    if (!academicSessionId || !academicTermId) {
      return res.status(400).json({
        message:
          "Academic session and academic term are required.",
      });
    }

    if (
      !isValidObjectId(academicSessionId) ||
      !isValidObjectId(academicTermId)
    ) {
      return res.status(400).json({
        message:
          "Invalid academic session or academic term ID.",
      });
    }

    const seats = Number(studentLimit);

    if (
      !Number.isInteger(seats) ||
      seats < 1
    ) {
      return res.status(400).json({
        message:
          "Student limit must be a positive whole number.",
      });
    }

    // --------------------------------------------------
    // Verify academic session
    // --------------------------------------------------
    const academicSession =
      await AcademicSession.findOne({
        _id: academicSessionId,
        school: schoolId,
      });

    if (!academicSession) {
      return res.status(404).json({
        message:
          "Academic session not found for this school.",
      });
    }

    // --------------------------------------------------
    // Verify academic term
    // --------------------------------------------------
    const academicTerm =
      await AcademicTerm.findOne({
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
    // Prevent duplicate active subscription
    // --------------------------------------------------
    const existingSubscription =
      await Subscription.findOne({
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
    // Prevent multiple pending initial payments
    // --------------------------------------------------
    const existingPendingPayment =
      await Payment.findOne({
        school: schoolId,
        academicSession: academicSessionId,
        academicTerm: academicTermId,
        type: "initial_subscription",
        provider: "paystack",
        status: "pending",
      });

    if (existingPendingPayment) {
      return res.status(409).json({
        message:
          "A subscription payment is already pending for this academic term.",
        payment: {
          id: existingPendingPayment._id,
          reference:
            existingPendingPayment.paymentReference,
          amount: existingPendingPayment.amount,
          studentSeatsPurchased:
            existingPendingPayment.studentSeatsPurchased,
          status: existingPendingPayment.status,
        },
      });
    }

    // --------------------------------------------------
    // Calculate amount on backend
    // --------------------------------------------------
    const amountInNaira =
      seats * PRICE_PER_STUDENT;

    const amountInKobo =
      Math.round(amountInNaira * 100);

    const paymentReference =
      generatePaymentReference("SUB");

    // --------------------------------------------------
    // Create pending Payment
    // --------------------------------------------------
    const payment =
      await Payment.create({
        school: schoolId,

        subscription: null,

        academicSession:
          academicSessionId,

        academicTerm:
          academicTermId,

        type: "initial_subscription",

        amount: amountInNaira,

        studentSeatsPurchased: seats,

        paymentReference,

        provider: "paystack",

        paymentMethod: "paystack",

        status: "pending",

        metadata: {
          academicSessionId:
            academicSessionId.toString(),

          academicTermId:
            academicTermId.toString(),

          studentLimit: seats,

          pricePerStudent:
            PRICE_PER_STUDENT,

          amountInNaira,
        },
      });

    // --------------------------------------------------
    // Paystack callback URL
    // --------------------------------------------------
    const callbackUrl =
      process.env.PAYSTACK_CALLBACK_URL;

    if (!callbackUrl) {
      await Payment.findByIdAndDelete(
        payment._id
      );

      return res.status(500).json({
        message:
          "PAYSTACK_CALLBACK_URL is not configured.",
      });
    }

    // --------------------------------------------------
    // Initialize Paystack
    // --------------------------------------------------
    try {
      const paystackTransaction =
        await initializeTransaction({
          email: userEmail,

          amount: amountInKobo,

          reference:
            paymentReference,

          callbackUrl,

          metadata: {
            paymentId:
              payment._id.toString(),

            schoolId:
              schoolId.toString(),

            academicSessionId:
              academicSessionId.toString(),

            academicTermId:
              academicTermId.toString(),

            type:
              "initial_subscription",

            studentLimit: seats,
          },
        });

      return res.status(200).json({
        message:
          "Subscription payment initialized successfully.",

        payment: {
          id: payment._id,

          reference:
            payment.paymentReference,

          amount:
            payment.amount,

          currency: "NGN",

          studentSeatsPurchased:
            payment.studentSeatsPurchased,

          status:
            payment.status,
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
      payment.status = "failed";

      payment.metadata = {
        ...(payment.metadata || {}),

        failureReason:
          "Paystack transaction initialization failed.",
      };

      await payment.save();

      throw error;
    }
  } catch (error) {
    console.error(
      "Initialize subscription payment error:",
      error
    );

    if (error?.code === 11000) {
      return res.status(409).json({
        message:
          "A subscription payment already exists for this academic term.",
      });
    }

    return res.status(500).json({
      message:
        "Failed to initialize subscription payment.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Verify initial subscription payment
// --------------------------------------------------
export const verifySubscriptionPayment = async (
  req,
  res
) => {
  try {
    const schoolId = getSchoolId(req);
    const { reference } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        message:
          "User is not associated with a school.",
      });
    }

    if (!reference?.trim()) {
      return res.status(400).json({
        message:
          "Payment reference is required.",
      });
    }

    const payment =
      await Payment.findOne({
        paymentReference:
          reference.trim(),

        school:
          schoolId,

        type:
          "initial_subscription",
      });

    if (!payment) {
      return res.status(404).json({
        message:
          "Subscription payment not found.",
      });
    }

    // --------------------------------------------------
    // Idempotency
    // --------------------------------------------------
    if (
      payment.status ===
      "successful"
    ) {
      const subscription =
        payment.subscription
          ? await Subscription.findOne({
              _id:
                payment.subscription,

              school:
                schoolId,
            })
          : null;

      return res.status(200).json({
        message:
          "Subscription payment has already been verified successfully.",

        payment,

        subscription,
      });
    }

    if (
      payment.status !==
      "pending"
    ) {
      return res.status(400).json({
        message:
          `This payment is ${payment.status}.`,

        payment,
      });
    }

    // --------------------------------------------------
    // Verify transaction with Paystack
    // --------------------------------------------------
    const transaction =
      await verifyTransaction(
        reference.trim()
      );

    // --------------------------------------------------
    // Keep abandoned checkout pending
    // --------------------------------------------------
    if (
      transaction.status ===
      "abandoned"
    ) {
      return res.status(400).json({
        message:
          "Payment was abandoned. No subscription was created.",

        paymentStatus:
          transaction.status,

        payment,
      });
    }

    // --------------------------------------------------
    // Process successful transaction
    // --------------------------------------------------
    const {
      processSuccessfulSubscriptionPayment,
    } = await import(
      "./paymentController.js"
    );

    const result =
      await processSuccessfulSubscriptionPayment({
        paymentId:
          payment._id,

        transaction,
      });

    return res.status(200).json({
      message:
        result.alreadyProcessed
          ? "Subscription payment has already been processed successfully."
          : "Subscription payment verified successfully.",

      payment:
        result.payment,

      subscription:
        result.subscription,
    });
  } catch (error) {
    console.error(
      "Verify subscription payment error:",
      error
    );

    switch (error.message) {
      case "PAYMENT_REFERENCE_MISMATCH":
        return res.status(400).json({
          message:
            "Payment reference mismatch.",
        });

      case "PAYMENT_NOT_SUCCESSFUL":
        return res.status(400).json({
          message:
            "Paystack transaction was not successful.",
        });

      case "PAYMENT_AMOUNT_MISMATCH":
        return res.status(400).json({
          message:
            "Payment amount does not match the expected amount.",
        });

      case "INVALID_STUDENT_SEAT_QUANTITY":
        return res.status(400).json({
          message:
            "Invalid student seat quantity.",
        });

      case "ACADEMIC_TERM_NOT_FOUND":
        return res.status(404).json({
          message:
            "Academic term associated with the payment was not found.",
        });

      default:
        return res.status(500).json({
          message:
            "Failed to verify subscription payment.",
          error: error.message,
        });
    }
  }
};

// --------------------------------------------------
// Get subscription for a specific term
// --------------------------------------------------
export const getTermSubscription = async (
  req,
  res
) => {
  try {
    const schoolId = getSchoolId(req);

    const {
      academicSessionId,
      academicTermId,
    } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        message:
          "User is not associated with a school.",
      });
    }

    if (
      !academicSessionId ||
      !academicTermId
    ) {
      return res.status(400).json({
        message:
          "Academic session ID and academic term ID are required.",
      });
    }

    if (
      !isValidObjectId(
        academicSessionId
      ) ||
      !isValidObjectId(
        academicTermId
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid academic session or academic term ID.",
      });
    }

    const subscription =
      await Subscription.findOne({
        school: schoolId,

        academicSession:
          academicSessionId,

        academicTerm:
          academicTermId,
      })
        .populate(
          "academicSession",
          "name startDate endDate"
        )
        .populate(
          "academicTerm",
          "name startDate endDate startsAt endsAt isCurrent isActive"
        );

    const activeStudentCount =
      await Student.countDocuments({
        school: schoolId,
        isActive: true,
      });

    if (!subscription) {
      return res.status(200).json({
        message:
          "No subscription found for this academic term.",

        subscription: null,

        usage: {
          studentLimit: 0,
          activeStudents:
            activeStudentCount,
          availableSeats: 0,
        },

        isSubscribed: false,
      });
    }

    const isSubscriptionActive =
      subscription.status === "active" &&
      (
        !subscription.expiresAt ||
        new Date(
          subscription.expiresAt
        ) >= new Date()
      );

    const availableSeats =
      Math.max(
        subscription.studentLimit -
          activeStudentCount,
        0
      );

    return res.status(200).json({
      message:
        "Subscription retrieved successfully.",

      subscription,

      usage: {
        studentLimit:
          subscription.studentLimit,

        activeStudents:
          activeStudentCount,

        availableSeats,
      },

      isSubscribed:
        isSubscriptionActive,
    });
  } catch (error) {
    console.error(
      "Get term subscription error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to retrieve subscription.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Get current term subscription
// --------------------------------------------------
export const getCurrentSubscription = async (
  req,
  res
) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message:
          "User is not associated with a school.",
      });
    }

    const currentTerm =
      await AcademicTerm.findOne({
        school: schoolId,
        isCurrent: true,
        isActive: true,
      });

    if (!currentTerm) {
      return res.status(404).json({
        message:
          "No current academic term found.",
      });
    }

    const subscription =
      await Subscription.findOne({
        school: schoolId,

        academicSession:
          currentTerm.academicSession,

        academicTerm:
          currentTerm._id,
      })
        .populate(
          "academicSession",
          "name startDate endDate"
        )
        .populate(
          "academicTerm",
          "name startDate endDate startsAt endsAt isCurrent isActive"
        );

    const activeStudentCount =
      await Student.countDocuments({
        school: schoolId,
        isActive: true,
      });

    if (!subscription) {
      return res.status(200).json({
        message:
          "No subscription found for the current term.",

        subscription: null,

        currentTerm,

        usage: {
          studentLimit: 0,
          activeStudents:
            activeStudentCount,
          availableSeats: 0,
        },

        isSubscribed: false,
      });
    }

    const isSubscriptionActive =
      subscription.status === "active" &&
      (
        !subscription.expiresAt ||
        new Date(
          subscription.expiresAt
        ) >= new Date()
      );

    const availableSeats =
      Math.max(
        subscription.studentLimit -
          activeStudentCount,
        0
      );

    return res.status(200).json({
      message:
        "Current subscription retrieved successfully.",

      subscription,

      currentTerm,

      usage: {
        studentLimit:
          subscription.studentLimit,

        activeStudents:
          activeStudentCount,

        availableSeats,
      },

      isSubscribed:
        isSubscriptionActive,
    });
  } catch (error) {
    console.error(
      "Get current subscription error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to retrieve current subscription.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Check subscription status
// --------------------------------------------------
export const checkSubscriptionStatus = async (
  req,
  res
) => {
  try {
    const schoolId = getSchoolId(req);

    const {
      academicSessionId,
      academicTermId,
    } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        message:
          "User is not associated with a school.",
      });
    }

    if (
      !academicSessionId ||
      !academicTermId
    ) {
      return res.status(400).json({
        message:
          "Academic session ID and academic term ID are required.",
      });
    }

    const activeStudentCount =
      await Student.countDocuments({
        school: schoolId,
        isActive: true,
      });

    const subscription =
      await Subscription.findOne({
        school: schoolId,

        academicSession:
          academicSessionId,

        academicTerm:
          academicTermId,
      });

    if (!subscription) {
      return res.status(200).json({
        isSubscribed: false,

        status: "not_subscribed",

        subscriptionId: null,

        studentLimit: 0,

        activeStudents:
          activeStudentCount,

        availableSeats: 0,

        expiresAt: null,
      });
    }

    const isActive =
      subscription.status === "active" &&
      (
        !subscription.expiresAt ||
        new Date(
          subscription.expiresAt
        ) >= new Date()
      );

    const availableSeats =
      Math.max(
        subscription.studentLimit -
          activeStudentCount,
        0
      );

    return res.status(200).json({
      isSubscribed: isActive,

      status:
        subscription.status,

      subscriptionId:
        subscription._id,

      studentLimit:
        subscription.studentLimit,

      activeStudents:
        activeStudentCount,

      availableSeats,

      expiresAt:
        subscription.expiresAt,
    });
  } catch (error) {
    console.error(
      "Check subscription status error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to check subscription status.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Initialize additional student seats payment
// --------------------------------------------------
export const initializeAdditionalSeatsPayment =
  async (req, res) => {
    try {
      const schoolId = getSchoolId(req);
      const userEmail = req.user?.email;

      const {
        subscriptionId,
        additionalSeats,
      } = req.body;

      if (!schoolId) {
        return res.status(400).json({
          message:
            "User is not associated with a school.",
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
          message:
            "Subscription ID is required.",
        });
      }

      if (
        !isValidObjectId(
          subscriptionId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid subscription ID.",
        });
      }

      const seats =
        Number(additionalSeats);

      if (
        !Number.isInteger(seats) ||
        seats < 1
      ) {
        return res.status(400).json({
          message:
            "Additional seats must be a positive whole number.",
        });
      }

      const subscription =
        await Subscription.findOne({
          _id: subscriptionId,
          school: schoolId,
          status: "active",
        });

      if (!subscription) {
        return res.status(404).json({
          message:
            "Active subscription not found.",
        });
      }

      // --------------------------------------------------
      // Prevent expired subscription from receiving seats
      // --------------------------------------------------
      if (
        subscription.expiresAt &&
        new Date(
          subscription.expiresAt
        ) < new Date()
      ) {
        return res.status(400).json({
          message:
            "This subscription has expired.",
        });
      }

      // --------------------------------------------------
      // Prevent multiple pending seat payments
      // --------------------------------------------------
      const pendingPayment =
        await Payment.findOne({
          school: schoolId,

          subscription:
            subscription._id,

          type:
            "additional_seats",

          provider:
            "paystack",

          status:
            "pending",
        });

      if (pendingPayment) {
        return res.status(409).json({
          message:
            "An additional-seat payment is already pending for this subscription.",

          payment: {
            id:
              pendingPayment._id,

            reference:
              pendingPayment.paymentReference,

            amount:
              pendingPayment.amount,

            studentSeatsPurchased:
              pendingPayment.studentSeatsPurchased,

            status:
              pendingPayment.status,
          },
        });
      }

      const amountInNaira =
        seats * PRICE_PER_STUDENT;

      const amountInKobo =
        Math.round(
          amountInNaira * 100
        );

      const paymentReference =
        generatePaymentReference(
          "SEAT"
        );

      const payment =
        await Payment.create({
          school:
            schoolId,

          subscription:
            subscription._id,

          academicSession:
            subscription.academicSession,

          academicTerm:
            subscription.academicTerm,

          type:
            "additional_seats",

          amount:
            amountInNaira,

          studentSeatsPurchased:
            seats,

          paymentReference,

          provider:
            "paystack",

          paymentMethod:
            "paystack",

          status:
            "pending",

          metadata: {
            subscriptionId:
              subscription._id.toString(),

            additionalSeats:
              seats,

            previousStudentLimit:
              subscription.studentLimit,

            pricePerStudent:
              PRICE_PER_STUDENT,

            amountInNaira,
          },
        });

      const callbackUrl =
        process.env.PAYSTACK_CALLBACK_URL;

      if (!callbackUrl) {
        await Payment.findByIdAndDelete(
          payment._id
        );

        return res.status(500).json({
          message:
            "PAYSTACK_CALLBACK_URL is not configured.",
        });
      }

      try {
        const paystackTransaction =
          await initializeTransaction({
            email:
              userEmail,

            amount:
              amountInKobo,

            reference:
              paymentReference,

            callbackUrl,

            metadata: {
              paymentId:
                payment._id.toString(),

              subscriptionId:
                subscription._id.toString(),

              schoolId:
                schoolId.toString(),

              academicSessionId:
                subscription.academicSession.toString(),

              academicTermId:
                subscription.academicTerm.toString(),

              type:
                "additional_seats",

              additionalSeats:
                seats,
            },
          });

        return res.status(200).json({
          message:
            "Additional-seat payment initialized successfully.",

          payment: {
            id:
              payment._id,

            reference:
              payment.paymentReference,

            amount:
              payment.amount,

            currency:
              "NGN",

            studentSeatsPurchased:
              payment.studentSeatsPurchased,

            status:
              payment.status,
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
        payment.status =
          "failed";

        payment.metadata = {
          ...(payment.metadata || {}),

          failureReason:
            "Paystack transaction initialization failed.",
        };

        await payment.save();

        throw error;
      }
    } catch (error) {
      console.error(
        "Initialize additional seats payment error:",
        error
      );

      if (error?.code === 11000) {
        return res.status(409).json({
          message:
            "An additional-seat payment already exists for this subscription.",
        });
      }

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
export const verifyAdditionalSeatsPayment =
  async (req, res) => {
    try {
      const schoolId = getSchoolId(req);
      const { reference } = req.params;

      if (!schoolId) {
        return res.status(400).json({
          message:
            "User is not associated with a school.",
        });
      }

      if (!reference?.trim()) {
        return res.status(400).json({
          message:
            "Payment reference is required.",
        });
      }

      const payment =
        await Payment.findOne({
          paymentReference:
            reference.trim(),

          school:
            schoolId,

          type:
            "additional_seats",
        });

      if (!payment) {
        return res.status(404).json({
          message:
            "Additional-seat payment not found.",
        });
      }

      if (
        payment.status ===
        "successful"
      ) {
        const subscription =
          payment.subscription
            ? await Subscription.findOne({
                _id:
                  payment.subscription,

                school:
                  schoolId,
              })
            : null;

        return res.status(200).json({
          message:
            "Additional-seat payment has already been verified successfully.",

          payment,

          subscription,
        });
      }

      if (
        payment.status !==
        "pending"
      ) {
        return res.status(400).json({
          message:
            `This payment is ${payment.status}.`,

          payment,
        });
      }

      const transaction =
        await verifyTransaction(
          reference.trim()
        );

      if (
        transaction.status ===
        "abandoned"
      ) {
        return res.status(400).json({
          message:
            "Payment was abandoned. No seats were added.",

          paymentStatus:
            transaction.status,

          payment,
        });
      }

      const {
        processSuccessfulSubscriptionPayment,
      } = await import(
        "./paymentController.js"
      );

      const result =
        await processSuccessfulSubscriptionPayment({
          paymentId:
            payment._id,

          transaction,
        });

      return res.status(200).json({
        message:
          result.alreadyProcessed
            ? "Additional-seat payment has already been processed successfully."
            : "Additional-seat payment verified successfully and seats added.",

        payment:
          result.payment,

        subscription:
          result.subscription,
      });
    } catch (error) {
      console.error(
        "Verify additional seats payment error:",
        error
      );

      switch (error.message) {
        case "PAYMENT_REFERENCE_MISMATCH":
          return res.status(400).json({
            message:
              "Payment reference mismatch.",
          });

        case "PAYMENT_NOT_SUCCESSFUL":
          return res.status(400).json({
            message:
              "Payment was not successful.",
          });

        case "PAYMENT_AMOUNT_MISMATCH":
          return res.status(400).json({
            message:
              "Payment amount does not match the expected amount.",
          });

        case "SUBSCRIPTION_NOT_FOUND":
          return res.status(404).json({
            message:
              "Associated subscription was not found.",
          });

        case "INVALID_ADDITIONAL_SEAT_QUANTITY":
          return res.status(400).json({
            message:
              "Invalid additional seat quantity.",
          });

        default:
          return res.status(500).json({
            message:
              "Failed to verify additional-seat payment.",
            error: error.message,
          });
      }
    }
  };

