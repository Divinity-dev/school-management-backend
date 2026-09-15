import crypto from "crypto";
import mongoose from "mongoose";

import Payment from "../models/Payment.js";
import Subscription from "../models/Subscription.js";
import StudentFeeAccount from "../models/StudentFeeAccount.js";

import {
  initializeTransaction,
  verifyTransaction,
} from "../utils/paystack.js";

const PRICE_PER_STUDENT = 1000;

const getSchoolId = (req) => {
  return req.user?.school?._id || req.user?.school || null;
};

const isValidObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(value);
};

const generatePaymentReference = (prefix) => {
  return `${prefix}-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
};

const buildPaystackMetadata = (transaction) => ({
  paystackTransactionId: transaction.id,
  paystackStatus: transaction.status,
  channel: transaction.channel,
  currency: transaction.currency,
  customerEmail: transaction.customer?.email,
});

/*
|--------------------------------------------------------------------------
| Process successful subscription payment
|--------------------------------------------------------------------------
| This is the single source of truth used by both:
| - manual verification
| - Paystack webhook
|
| Payment + subscription activation happen in one transaction.
|--------------------------------------------------------------------------
*/
const processSuccessfulSubscriptionPayment = async ({
  paymentId,
  transaction,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(
        session
      );

      if (!payment) {
        throw new Error("PAYMENT_NOT_FOUND");
      }

      // Idempotency.
      if (payment.status === "successful") {
        const subscription = await Subscription.findById(
          payment.subscription
        ).session(session);

        result = {
          alreadyProcessed: true,
          payment,
          subscription,
        };

        return;
      }

      if (payment.type === "school_fees") {
        throw new Error("INVALID_PAYMENT_TYPE");
      }

      const expectedAmountInKobo = Math.round(
        Number(payment.amount) * 100
      );

      if (
        Number(transaction.amount) !==
        expectedAmountInKobo
      ) {
        payment.status = "failed";
        payment.metadata = {
          ...(payment.metadata || {}),
          failureReason:
            "Payment amount does not match the expected amount.",
          paystackAmount: transaction.amount,
        };

        await payment.save({ session });

        throw new Error("PAYMENT_AMOUNT_MISMATCH");
      }

      if (transaction.status !== "success") {
        payment.status = "failed";
        payment.metadata = {
          ...(payment.metadata || {}),
          paystackStatus: transaction.status,
          failureReason:
            "Paystack transaction was not successful.",
        };

        await payment.save({ session });

        throw new Error("PAYMENT_NOT_SUCCESSFUL");
      }

      if (
        transaction.reference !==
        payment.paymentReference
      ) {
        throw new Error("PAYMENT_REFERENCE_MISMATCH");
      }

      const subscription = await Subscription.findOne({
        _id: payment.subscription,
        school: payment.school,
      }).session(session);

      if (!subscription) {
        throw new Error("SUBSCRIPTION_NOT_FOUND");
      }

      const expectedSubscriptionAmount =
        Number(subscription.studentLimit) *
        PRICE_PER_STUDENT;

      if (
        Number(subscription.amount) !==
        expectedSubscriptionAmount
      ) {
        throw new Error("SUBSCRIPTION_AMOUNT_MISMATCH");
      }

      const now = new Date();

      payment.status = "successful";
      payment.paidAt = now;
      payment.metadata = {
        ...(payment.metadata || {}),
        ...buildPaystackMetadata(transaction),
      };

      subscription.status = "active";
      subscription.activatedAt =
        subscription.activatedAt || now;

      await payment.save({ session });
      await subscription.save({ session });

      result = {
        alreadyProcessed: false,
        payment,
        subscription,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| Process successful school-fee payment
|--------------------------------------------------------------------------
| This is the critical financial integrity function.
|
| Both:
| - Paystack webhook
| - manual verification
|
| call this same function.
|
| Fee account update + payment success are atomic.
|--------------------------------------------------------------------------
*/
const processSuccessfulSchoolFeePayment = async ({
  paymentId,
  transaction,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(
        session
      );

      if (!payment) {
        throw new Error("PAYMENT_NOT_FOUND");
      }

      // Strong idempotency.
      if (payment.status === "successful") {
        const feeAccount =
          await StudentFeeAccount.findOne({
            _id: payment.studentFeeAccount,
            school: payment.school,
          }).session(session);

        result = {
          alreadyProcessed: true,
          payment,
          feeAccount,
        };

        return;
      }

      if (payment.type !== "school_fees") {
        throw new Error("INVALID_PAYMENT_TYPE");
      }

      if (
        transaction.reference !==
        payment.paymentReference
      ) {
        throw new Error("PAYMENT_REFERENCE_MISMATCH");
      }

      const expectedAmountInKobo = Math.round(
        Number(payment.amount) * 100
      );

      if (
        Number(transaction.amount) !==
        expectedAmountInKobo
      ) {
        payment.status = "failed";
        payment.metadata = {
          ...(payment.metadata || {}),
          failureReason:
            "Payment amount does not match the expected amount.",
          paystackAmount: transaction.amount,
        };

        await payment.save({ session });

        throw new Error("PAYMENT_AMOUNT_MISMATCH");
      }

      if (transaction.status !== "success") {
        payment.status = "failed";
        payment.metadata = {
          ...(payment.metadata || {}),
          paystackStatus: transaction.status,
          failureReason:
            "Paystack transaction was not successful.",
        };

        await payment.save({ session });

        throw new Error("PAYMENT_NOT_SUCCESSFUL");
      }

      const feeAccount =
        await StudentFeeAccount.findOne({
          _id: payment.studentFeeAccount,
          school: payment.school,
          isActive: true,
        }).session(session);

      if (!feeAccount) {
        throw new Error("FEE_ACCOUNT_NOT_FOUND");
      }

      const currentBalance =
        Number(feeAccount.totalAmountDue) -
        Number(feeAccount.amountPaid);

      /*
      |--------------------------------------------------------------------------
      | Never silently absorb money when the account is already paid.
      |--------------------------------------------------------------------------
      */
      if (currentBalance <= 0) {
        payment.metadata = {
          ...(payment.metadata || {}),
          ...buildPaystackMetadata(transaction),
          reconciliationRequired: true,
          reconciliationReason:
            "Paystack payment succeeded but the fee account was already fully paid.",
        };

        /*
        | Keep payment pending rather than falsely declaring
        | it successfully allocated to the student account.
        |
        | This gives us a visible reconciliation exception.
        */
        await payment.save({ session });

        throw new Error(
          "FEE_ACCOUNT_ALREADY_PAID"
        );
      }

      if (
        Number(payment.amount) >
        currentBalance
      ) {
        payment.status = "failed";

        payment.metadata = {
          ...(payment.metadata || {}),
          failureReason:
            "Payment amount exceeds the current outstanding balance.",
          currentBalance,
          paystackAmount: transaction.amount,
        };

        await payment.save({ session });

        throw new Error("PAYMENT_EXCEEDS_BALANCE");
      }

      const newAmountPaid =
        Number(feeAccount.amountPaid) +
        Number(payment.amount);

      const newBalance =
        Number(feeAccount.totalAmountDue) -
        newAmountPaid;

      feeAccount.amountPaid = newAmountPaid;
      feeAccount.balance =
        newBalance <= 0 ? 0 : newBalance;

      if (feeAccount.balance === 0) {
        feeAccount.status = "paid";
      } else if (feeAccount.amountPaid > 0) {
        feeAccount.status = "partial";
      } else {
        feeAccount.status = "unpaid";
      }

      payment.status = "successful";
      payment.paidAt = new Date();

      payment.metadata = {
        ...(payment.metadata || {}),
        ...buildPaystackMetadata(transaction),
      };

      await feeAccount.save({ session });
      await payment.save({ session });

      result = {
        alreadyProcessed: false,
        payment,
        feeAccount,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| Initialize subscription payment
|--------------------------------------------------------------------------
*/
export const initializeSubscriptionPayment = async (
  req,
  res
) => {
  let payment = null;

  try {
    const schoolId = getSchoolId(req);
    const { subscriptionId } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        message: "User is not associated with a school.",
      });
    }

    if (
      !subscriptionId ||
      !isValidObjectId(subscriptionId)
    ) {
      return res.status(400).json({
        message: "A valid subscription ID is required.",
      });
    }

    const subscription =
      await Subscription.findOne({
        _id: subscriptionId,
        school: schoolId,
      });

    if (!subscription) {
      return res.status(404).json({
        message: "Subscription not found.",
      });
    }

    if (subscription.status !== "pending") {
      return res.status(400).json({
        message:
          "Payment can only be initialized for a pending subscription.",
      });
    }

    const expectedAmount =
      Number(subscription.studentLimit) *
      PRICE_PER_STUDENT;

    if (
      !Number.isFinite(expectedAmount) ||
      expectedAmount <= 0
    ) {
      return res.status(400).json({
        message:
          "The subscription amount is invalid.",
      });
    }

    if (
      Number(subscription.amount) !==
      expectedAmount
    ) {
      return res.status(400).json({
        message:
          "Subscription amount does not match the current pricing.",
      });
    }

    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        message:
          "Authenticated user's email is required for payment.",
      });
    }

    const existingPayment =
      await Payment.findOne({
        subscription: subscription._id,
        status: "pending",
        provider: "paystack",
      });

    if (existingPayment) {
      return res.status(200).json({
        message:
          "A pending payment already exists for this subscription.",
        payment: {
          id: existingPayment._id,
          reference:
            existingPayment.paymentReference,
          amount: existingPayment.amount,
          studentSeatsPurchased:
            existingPayment.studentSeatsPurchased,
          status: existingPayment.status,
        },
      });
    }

    const paymentReference =
      generatePaymentReference("SCH");

    payment = await Payment.create({
      school: schoolId,
      subscription: subscription._id,
      academicSession:
        subscription.academicSession,
      academicTerm:
        subscription.academicTerm,
      type: "initial_subscription",
      amount: expectedAmount,
      studentSeatsPurchased:
        subscription.studentLimit,
      paymentReference,
      provider: "paystack",
      paymentMethod: "paystack",
      status: "pending",
      metadata: {
        pricePerStudent: PRICE_PER_STUDENT,
        studentLimit: subscription.studentLimit,
      },
    });

    try {
      const paystackTransaction =
        await initializeTransaction({
          email,
          amount: Math.round(
            expectedAmount * 100
          ),
          reference: paymentReference,
          callbackUrl:
            process.env.PAYSTACK_CALLBACK_URL,
          metadata: {
            paymentId: payment._id.toString(),
            subscriptionId:
              subscription._id.toString(),
            schoolId: schoolId.toString(),
            type: "initial_subscription",
            studentSeatsPurchased:
              subscription.studentLimit,
          },
        });

      return res.status(200).json({
        message:
          "Subscription payment initialized successfully.",
        payment: {
          id: payment._id,
          reference:
            payment.paymentReference,
          amount: payment.amount,
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

    return res.status(500).json({
      message:
        "Failed to initialize subscription payment.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Verify subscription payment
|--------------------------------------------------------------------------
*/
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
        paymentReference: reference.trim(),
        school: schoolId,
      });

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found.",
      });
    }

    if (payment.status === "successful") {
      const subscription =
        await Subscription.findOne({
          _id: payment.subscription,
          school: schoolId,
        });

      return res.status(200).json({
        message:
          "Payment has already been verified successfully.",
        payment,
        subscription,
      });
    }

    const transaction =
      await verifyTransaction(
        reference.trim()
      );

    let result;

    try {
      result =
        await processSuccessfulSubscriptionPayment({
          paymentId: payment._id,
          transaction,
        });
    } catch (error) {
      if (
        error.message ===
        "PAYMENT_AMOUNT_MISMATCH"
      ) {
        return res.status(400).json({
          message:
            "Payment amount does not match the expected amount.",
        });
      }

      if (
        error.message ===
        "PAYMENT_REFERENCE_MISMATCH"
      ) {
        return res.status(400).json({
          message:
            "Payment reference mismatch.",
        });
      }

      if (
        error.message ===
        "PAYMENT_NOT_SUCCESSFUL"
      ) {
        return res.status(400).json({
          message:
            "Payment was not successful.",
          status: transaction.status,
        });
      }

      if (
        error.message ===
        "SUBSCRIPTION_NOT_FOUND"
      ) {
        return res.status(404).json({
          message:
            "Subscription associated with this payment was not found.",
        });
      }

      if (
        error.message ===
        "SUBSCRIPTION_AMOUNT_MISMATCH"
      ) {
        return res.status(400).json({
          message:
            "Subscription amount does not match the current pricing.",
        });
      }

      throw error;
    }

    return res.status(200).json({
      message: result.alreadyProcessed
        ? "Payment has already been processed successfully."
        : "Payment verified and subscription activated successfully.",
      payment: result.payment,
      subscription: result.subscription,
    });
  } catch (error) {
    console.error(
      "Verify subscription payment error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to verify subscription payment.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Paystack webhook
|--------------------------------------------------------------------------
*/
export const handlePaystackWebhook = async (
  req,
  res
) => {
  try {
    const signature =
      req.headers["x-paystack-signature"];

    if (!signature) {
      return res.status(400).json({
        message:
          "Paystack signature is missing.",
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.error(
        "PAYSTACK_SECRET_KEY is not configured."
      );

      return res.status(500).json({
        message:
          "Payment configuration error.",
      });
    }

    if (!Buffer.isBuffer(req.body)) {
      console.error(
        "Paystack webhook body is not a raw Buffer."
      );

      return res.status(500).json({
        message:
          "Invalid webhook configuration.",
      });
    }

    const expectedSignature =
      crypto
        .createHmac(
          "sha512",
          process.env.PAYSTACK_SECRET_KEY
        )
        .update(req.body)
        .digest("hex");

    const received =
      Buffer.from(signature, "utf8");

    const expected =
      Buffer.from(expectedSignature, "utf8");

    if (
      received.length !==
        expected.length ||
      !crypto.timingSafeEqual(
        received,
        expected
      )
    ) {
      return res.status(401).json({
        message:
          "Invalid Paystack signature.",
      });
    }

    let event;

    try {
      event = JSON.parse(
        req.body.toString("utf8")
      );
    } catch (error) {
      return res.status(400).json({
        message:
          "Invalid webhook payload.",
      });
    }

    console.log(
      "Paystack webhook received:",
      event.event
    );

    if (event.event !== "charge.success") {
      return res.status(200).json({
        message: "Webhook received.",
      });
    }

    const transaction = event.data;

    if (!transaction?.reference) {
      return res.status(400).json({
        message:
          "Payment reference is missing.",
      });
    }

    const payment =
      await Payment.findOne({
        paymentReference:
          transaction.reference,
      });

    if (!payment) {
      console.warn(
        `Payment not found for Paystack reference: ${transaction.reference}`
      );

      return res.status(200).json({
        message:
          "Payment not found. Webhook acknowledged.",
      });
    }

    if (payment.status === "successful") {
      return res.status(200).json({
        message:
          "Payment already processed.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | School-fee payment
    |--------------------------------------------------------------------------
    */
    if (payment.type === "school_fees") {
      try {
        const result =
          await processSuccessfulSchoolFeePayment({
            paymentId: payment._id,
            transaction,
          });

        return res.status(200).json({
          message: result.alreadyProcessed
            ? "Payment already processed."
            : "School fee payment processed successfully.",
        });
      } catch (error) {
        if (
          error.message ===
          "PAYMENT_AMOUNT_MISMATCH"
        ) {
          return res.status(400).json({
            message:
              "Payment amount does not match.",
          });
        }

        if (
          error.message ===
          "PAYMENT_REFERENCE_MISMATCH"
        ) {
          return res.status(400).json({
            message:
              "Payment reference mismatch.",
          });
        }

        if (
          error.message ===
          "PAYMENT_NOT_SUCCESSFUL"
        ) {
          return res.status(200).json({
            message:
              "Unsuccessful payment webhook processed.",
          });
        }

        if (
          error.message ===
          "PAYMENT_EXCEEDS_BALANCE"
        ) {
          return res.status(400).json({
            message:
              "Payment amount exceeds the student's current outstanding balance.",
          });
        }

        if (
          error.message ===
          "FEE_ACCOUNT_ALREADY_PAID"
        ) {
          /*
          | Paystack has confirmed money was received,
          | but we deliberately do not falsely mark the
          | payment as successfully allocated.
          |
          | Return 200 so Paystack does not endlessly retry.
          */
          console.error(
            `Reconciliation required for payment ${payment.paymentReference}.`
          );

          return res.status(200).json({
            message:
              "Payment received but requires reconciliation.",
          });
        }

        if (
          error.message ===
          "FEE_ACCOUNT_NOT_FOUND"
        ) {
          return res.status(500).json({
            message:
              "Associated student fee account not found.",
          });
        }

        throw error;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Subscription payment
    |--------------------------------------------------------------------------
    */
    try {
      const result =
        await processSuccessfulSubscriptionPayment({
          paymentId: payment._id,
          transaction,
        });

      console.log(
        `Payment ${payment.paymentReference} processed successfully.`
      );

      return res.status(200).json({
        message: result.alreadyProcessed
          ? "Payment already processed."
          : "Paystack webhook processed successfully.",
      });
    } catch (error) {
      if (
        error.message ===
        "PAYMENT_AMOUNT_MISMATCH"
      ) {
        return res.status(400).json({
          message:
            "Payment amount does not match.",
        });
      }

      if (
        error.message ===
        "PAYMENT_REFERENCE_MISMATCH"
      ) {
        return res.status(400).json({
          message:
            "Payment reference mismatch.",
        });
      }

      if (
        error.message ===
        "PAYMENT_NOT_SUCCESSFUL"
      ) {
        return res.status(200).json({
          message:
            "Unsuccessful payment webhook processed.",
        });
      }

      if (
        error.message ===
        "SUBSCRIPTION_NOT_FOUND"
      ) {
        return res.status(500).json({
          message:
            "Associated subscription not found.",
        });
      }

      if (
        error.message ===
        "SUBSCRIPTION_AMOUNT_MISMATCH"
      ) {
        return res.status(400).json({
          message:
            "Subscription amount does not match current pricing.",
        });
      }

      throw error;
    }
  } catch (error) {
    console.error(
      "Paystack webhook error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to process Paystack webhook.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Initialize school-fee payment
|--------------------------------------------------------------------------
*/
export const initializeSchoolFeePayment = async (
  req,
  res
) => {
  let payment = null;

  try {
    const schoolId = getSchoolId(req);

    const {
      studentFeeAccountId,
      amount,
    } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        message:
          "User is not associated with a school.",
      });
    }

    if (
      !studentFeeAccountId ||
      !isValidObjectId(
        studentFeeAccountId
      )
    ) {
      return res.status(400).json({
        message:
          "A valid student fee account ID is required.",
      });
    }

    const paymentAmount = Number(amount);

    if (
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0
    ) {
      return res.status(400).json({
        message:
          "Payment amount must be greater than zero.",
      });
    }

    const feeAccount =
      await StudentFeeAccount.findOne({
        _id: studentFeeAccountId,
        school: schoolId,
        isActive: true,
      });

    if (!feeAccount) {
      return res.status(404).json({
        message:
          "Student fee account not found.",
      });
    }

    const outstandingBalance =
      Number(feeAccount.totalAmountDue) -
      Number(feeAccount.amountPaid);

    if (
      outstandingBalance <= 0 ||
      feeAccount.status === "paid"
    ) {
      return res.status(400).json({
        message:
          "This student's fees have already been fully paid.",
      });
    }

    if (
      paymentAmount >
      outstandingBalance
    ) {
      return res.status(400).json({
        message:
          "Payment amount cannot exceed the outstanding balance.",
        outstandingBalance,
      });
    }

    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        message:
          "Authenticated user's email is required for payment.",
      });
    }

    const existingPayment =
      await Payment.findOne({
        school: schoolId,
        studentFeeAccount:
          feeAccount._id,
        type: "school_fees",
        provider: "paystack",
        status: "pending",
      });

    if (existingPayment) {
      return res.status(200).json({
        message:
          "A pending payment already exists for this student fee account.",
        payment: {
          id: existingPayment._id,
          reference:
            existingPayment.paymentReference,
          amount: existingPayment.amount,
          status: existingPayment.status,
        },
      });
    }

    const paymentReference =
      generatePaymentReference("FEES");

    payment = await Payment.create({
      school: schoolId,
      subscription: null,
      studentFeeAccount:
        feeAccount._id,
      academicSession:
        feeAccount.academicSession,
      academicTerm:
        feeAccount.academicTerm,
      type: "school_fees",
      amount: paymentAmount,
      studentSeatsPurchased: null,
      paymentReference,
      provider: "paystack",
      paymentMethod: "paystack",
      status: "pending",
      metadata: {
        totalAmountDue:
          feeAccount.totalAmountDue,
        amountPaidBeforePayment:
          feeAccount.amountPaid,
        balanceBeforePayment:
          outstandingBalance,
        requestedAmount:
          paymentAmount,
      },
    });

    try {
      const paystackTransaction =
        await initializeTransaction({
          email,
          amount: Math.round(
            paymentAmount * 100
          ),
          reference: paymentReference,
          callbackUrl:
            process.env.PAYSTACK_CALLBACK_URL,
          metadata: {
            paymentId:
              payment._id.toString(),
            studentFeeAccountId:
              feeAccount._id.toString(),
            studentId:
              feeAccount.student.toString(),
            schoolId:
              schoolId.toString(),
            type: "school_fees",
          },
        });

      return res.status(200).json({
        message:
          "School fee payment initialized successfully.",
        payment: {
          id: payment._id,
          reference:
            payment.paymentReference,
          amount: payment.amount,
          status: payment.status,
          studentFeeAccount:
            payment.studentFeeAccount,
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
      "Initialize school fee payment error:",
      error
    );

    /*
    | Duplicate pending payment can occur if the unique
    | partial index catches a concurrent request.
    */
    if (error?.code === 11000) {
      return res.status(409).json({
        message:
          "A pending payment already exists for this student fee account.",
      });
    }

    return res.status(500).json({
      message:
        "Failed to initialize school fee payment.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Verify school-fee payment
|--------------------------------------------------------------------------
*/
export const verifySchoolFeePayment = async (
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
        school: schoolId,
        type: "school_fees",
      });

    if (!payment) {
      return res.status(404).json({
        message:
          "School fee payment not found.",
      });
    }

    if (payment.status === "successful") {
      const feeAccount =
        await StudentFeeAccount.findOne({
          _id: payment.studentFeeAccount,
          school: schoolId,
        });

      return res.status(200).json({
        message:
          "Payment has already been verified successfully.",
        payment,
        studentFeeAccount:
          feeAccount,
      });
    }

    const transaction =
      await verifyTransaction(
        reference.trim()
      );

    let result;

    try {
      result =
        await processSuccessfulSchoolFeePayment({
          paymentId: payment._id,
          transaction,
        });
    } catch (error) {
      if (
        error.message ===
        "PAYMENT_AMOUNT_MISMATCH"
      ) {
        return res.status(400).json({
          message:
            "Payment amount does not match the expected amount.",
        });
      }

      if (
        error.message ===
        "PAYMENT_REFERENCE_MISMATCH"
      ) {
        return res.status(400).json({
          message:
            "Payment reference mismatch.",
        });
      }

      if (
        error.message ===
        "PAYMENT_NOT_SUCCESSFUL"
      ) {
        return res.status(400).json({
          message:
            "Payment was not successful.",
          status: transaction.status,
        });
      }

      if (
        error.message ===
        "FEE_ACCOUNT_NOT_FOUND"
      ) {
        return res.status(404).json({
          message:
            "Student fee account associated with this payment was not found.",
        });
      }

      if (
        error.message ===
        "PAYMENT_EXCEEDS_BALANCE"
      ) {
        return res.status(400).json({
          message:
            "Payment amount exceeds the student's current outstanding balance.",
        });
      }

      if (
        error.message ===
        "FEE_ACCOUNT_ALREADY_PAID"
      ) {
        return res.status(409).json({
          message:
            "The Paystack payment was successful, but the fee account is already fully paid and requires reconciliation.",
        });
      }

      throw error;
    }

    return res.status(200).json({
      message: result.alreadyProcessed
        ? "Payment has already been processed successfully."
        : "School fee payment verified and fee account updated successfully.",
      payment: result.payment,
      studentFeeAccount:
        result.feeAccount,
    });
  } catch (error) {
    console.error(
      "Verify school fee payment error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to verify school fee payment.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get school fee payment history
|--------------------------------------------------------------------------
*/
export const getSchoolFeePayments = async (
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

    const {
      student,
      studentFeeAccount,
      academicSession,
      academicTerm,
      status,
    } = req.query;

    const filter = {
      school: schoolId,
      type: "school_fees",
    };

    if (studentFeeAccount) {
      if (
        !isValidObjectId(
          studentFeeAccount
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid student fee account ID.",
        });
      }

      filter.studentFeeAccount =
        studentFeeAccount;
    }

    if (academicSession) {
      if (
        !isValidObjectId(
          academicSession
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid academic session ID.",
        });
      }

      filter.academicSession =
        academicSession;
    }

    if (academicTerm) {
      if (
        !isValidObjectId(
          academicTerm
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid academic term ID.",
        });
      }

      filter.academicTerm =
        academicTerm;
    }

    if (status) {
      const allowedStatuses = [
        "pending",
        "successful",
        "failed",
        "cancelled",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message:
            "Invalid payment status.",
        });
      }

      filter.status = status;
    }

    if (student) {
      if (!isValidObjectId(student)) {
        return res.status(400).json({
          message: "Invalid student ID.",
        });
      }

      const studentFeeAccounts =
        await StudentFeeAccount.find({
          school: schoolId,
          student,
        }).select("_id");

      filter.studentFeeAccount = {
        $in: studentFeeAccounts.map(
          (account) => account._id
        ),
      };
    }

    const payments =
      await Payment.find(filter)
        .populate({
          path: "studentFeeAccount",
          populate: [
            {
              path: "student",
              select:
                "studentId firstName middleName lastName schoolClass",
            },
            {
              path: "feeStructure",
              select:
                "items totalAmount isActive schoolClasses",
            },
          ],
        })
        .populate(
          "academicSession",
          "name"
        )
        .populate(
          "academicTerm",
          "name"
        )
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      message:
        "School fee payment history retrieved successfully.",
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error(
      "Get school fee payments error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while retrieving school fee payment history.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get single school fee payment
|--------------------------------------------------------------------------
*/
export const getSchoolFeePaymentById = async (
  req,
  res
) => {
  try {
    const schoolId = getSchoolId(req);
    const { id } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        message:
          "User is not associated with a school.",
      });
    }

    if (
      !id ||
      !isValidObjectId(id)
    ) {
      return res.status(400).json({
        message:
          "A valid payment ID is required.",
      });
    }

    const payment =
      await Payment.findOne({
        _id: id,
        school: schoolId,
        type: "school_fees",
      })
        .populate({
          path: "studentFeeAccount",
          populate: [
            {
              path: "student",
              select:
                "studentId firstName middleName lastName schoolClass",
            },
            {
              path: "feeStructure",
              select:
                "items totalAmount isActive schoolClasses",
            },
          ],
        })
        .populate(
          "academicSession",
          "name"
        )
        .populate(
          "academicTerm",
          "name"
        );

    if (!payment) {
      return res.status(404).json({
        message:
          "School fee payment not found.",
      });
    }

    return res.status(200).json({
      message:
        "School fee payment retrieved successfully.",
      payment,
    });
  } catch (error) {
    console.error(
      "Get school fee payment by ID error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while retrieving school fee payment.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Record offline school-fee payment
|--------------------------------------------------------------------------
*/
export const recordOfflineSchoolFeePayment =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    try {
      const schoolId = getSchoolId(req);

      if (!schoolId) {
        return res.status(400).json({
          message:
            "User is not associated with a school.",
        });
      }

      const {
        studentFeeAccountId,
        amount,
        paymentMethod,
        note,
      } = req.body;

      if (
        !studentFeeAccountId ||
        !isValidObjectId(
          studentFeeAccountId
        )
      ) {
        return res.status(400).json({
          message:
            "A valid student fee account ID is required.",
        });
      }

      const paymentAmount = Number(amount);

      if (
        !Number.isFinite(paymentAmount) ||
        paymentAmount <= 0
      ) {
        return res.status(400).json({
          message:
            "Payment amount must be greater than zero.",
        });
      }

      const allowedPaymentMethods = [
        "cash",
        "bank_transfer",
        "pos",
        "other",
      ];

      if (
        !allowedPaymentMethods.includes(
          paymentMethod
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid payment method. Use cash, bank_transfer, pos, or other.",
        });
      }

      let populatedPayment;
      let feeAccountResponse;

      await session.withTransaction(
        async () => {
          /*
          |--------------------------------------------------------------------------
          | Do not allow an offline payment while a Paystack
          | payment is still pending.
          |--------------------------------------------------------------------------
          */
          const pendingPayment =
            await Payment.findOne({
              school: schoolId,
              studentFeeAccount:
                studentFeeAccountId,
              type: "school_fees",
              provider: "paystack",
              status: "pending",
            }).session(session);

          if (pendingPayment) {
            throw new Error(
              "PENDING_PAYSTACK_PAYMENT_EXISTS"
            );
          }

          const feeAccount =
            await StudentFeeAccount.findOne({
              _id: studentFeeAccountId,
              school: schoolId,
              isActive: true,
            }).session(session);

          if (!feeAccount) {
            throw new Error(
              "FEE_ACCOUNT_NOT_FOUND"
            );
          }

          const currentBalance =
            Number(
              feeAccount.totalAmountDue
            ) -
            Number(
              feeAccount.amountPaid
            );

          if (currentBalance <= 0) {
            throw new Error(
              "FEE_ACCOUNT_ALREADY_PAID"
            );
          }

          if (
            paymentAmount >
            currentBalance
          ) {
            throw new Error(
              "PAYMENT_EXCEEDS_BALANCE"
            );
          }

          const amountPaidBefore =
            Number(
              feeAccount.amountPaid
            );

          const newAmountPaid =
            amountPaidBefore +
            paymentAmount;

          const newBalance =
            Number(
              feeAccount.totalAmountDue
            ) -
            newAmountPaid;

          feeAccount.amountPaid =
            newAmountPaid;

          feeAccount.balance =
            newBalance <= 0
              ? 0
              : newBalance;

          if (
            feeAccount.balance === 0
          ) {
            feeAccount.status = "paid";
          } else {
            feeAccount.status = "partial";
          }

          await feeAccount.save({
            session,
          });

          const paymentReference =
            generatePaymentReference(
              "OFFLINE"
            );

          const payment =
            new Payment({
              school: schoolId,
              subscription: null,
              studentFeeAccount:
                feeAccount._id,
              academicSession:
                feeAccount.academicSession,
              academicTerm:
                feeAccount.academicTerm,
              type: "school_fees",
              amount: paymentAmount,
              studentSeatsPurchased:
                null,
              paymentReference,
              provider: "offline",
              paymentMethod,
              paystackTransactionId:
                null,
              status: "successful",
              paidAt: new Date(),
              metadata: {
                paymentMethod,
                note:
                  typeof note === "string"
                    ? note.trim()
                    : null,
                totalAmountDue:
                  feeAccount.totalAmountDue,
                amountPaidBeforePayment:
                  amountPaidBefore,
                amountPaidAfterPayment:
                  newAmountPaid,
                balanceAfterPayment:
                  feeAccount.balance,
                recordedBy:
                  req.user?._id || null,
              },
            });

          await payment.save({
            session,
          });

          populatedPayment =
            payment;

          feeAccountResponse = {
            totalAmountDue:
              feeAccount.totalAmountDue,
            amountPaid:
              feeAccount.amountPaid,
            balance:
              feeAccount.balance,
            status:
              feeAccount.status,
          };
        }
      );

      populatedPayment =
        await Payment.findById(
          populatedPayment._id
        )
          .populate({
            path: "studentFeeAccount",
            populate: [
              {
                path: "student",
                select:
                  "studentId firstName middleName lastName schoolClass",
              },
              {
                path: "feeStructure",
                select:
                  "items totalAmount isActive schoolClasses",
              },
            ],
          })
          .populate(
            "academicSession",
            "name"
          )
          .populate(
            "academicTerm",
            "name"
          );

      return res.status(201).json({
        message:
          "Offline school fee payment recorded successfully.",
        payment: populatedPayment,
        feeAccount:
          feeAccountResponse,
      });
    } catch (error) {
      console.error(
        "Record offline school fee payment error:",
        error
      );

      if (
        error.message ===
        "PENDING_PAYSTACK_PAYMENT_EXISTS"
      ) {
        return res.status(409).json({
          message:
            "A pending Paystack payment already exists for this student fee account. Complete or resolve that payment before recording an offline payment.",
        });
      }

      if (
        error.message ===
        "FEE_ACCOUNT_NOT_FOUND"
      ) {
        return res.status(404).json({
          message:
            "Student fee account not found.",
        });
      }

      if (
        error.message ===
        "FEE_ACCOUNT_ALREADY_PAID"
      ) {
        return res.status(400).json({
          message:
            "This student fee account is already fully paid.",
        });
      }

      if (
        error.message ===
        "PAYMENT_EXCEEDS_BALANCE"
      ) {
        return res.status(400).json({
          message:
            "Payment amount cannot exceed the outstanding balance.",
        });
      }

      return res.status(500).json({
        message:
          "Server error while recording offline school fee payment.",
      });
    } finally {
      await session.endSession();
    }
  };