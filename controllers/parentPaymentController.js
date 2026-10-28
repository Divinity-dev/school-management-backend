
import crypto from "node:crypto";
import mongoose from "mongoose";

import Payment from "../models/Payment.js";
import StudentFeeAccount from "../models/StudentFeeAccount.js";
import Student from "../models/Student.js";
import School from "../models/School.js";

import {
  initializeTransaction,
  verifyTransaction,
} from "../utils/paystack.js";

const getSchoolId = (req) =>
  req.user?.school?._id || req.user?.school;

const getConfiguredFrontendOrigin = () => {
  const configuredUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  try {
    return new URL(configuredUrl).origin;
  } catch {
    throw createError("FRONTEND_URL is not a valid URL.", 500);
  }
};

/**
 * Keep Paystack's callback on the same school website that initiated payment.
 * The browser's Origin is accepted only when it is the configured platform
 * frontend, this school's platform subdomain, this school's verified custom
 * domain, or localhost during development.
 */
const getPaymentCallbackOrigin = async (req, schoolId) => {
  const originHeader = req.get("origin");

  if (!originHeader) {
    return getConfiguredFrontendOrigin();
  }

  let originUrl;

  try {
    originUrl = new URL(originHeader);
  } catch {
    throw createError("The payment website origin is invalid.", 400);
  }

  if (
    originUrl.origin !== originHeader ||
    !["https:", "http:"].includes(originUrl.protocol)
  ) {
    throw createError("The payment website origin is invalid.", 400);
  }

  const origin = originUrl.origin;
  const hostname = originUrl.hostname.toLowerCase();
  const configuredOrigin = getConfiguredFrontendOrigin();

  if (origin === configuredOrigin) {
    return origin;
  }

  if (
    hostname === "school-pilot.app" ||
    hostname === "www.school-pilot.app"
  ) {
    return origin;
  }

  if (
    process.env.NODE_ENV !== "production" &&
    originUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(hostname)
  ) {
    return origin;
  }

  const platformDomain = "school-pilot.app";

  if (hostname.endsWith("." + platformDomain)) {
    const subdomain = hostname.slice(0, -(platformDomain.length + 1));
    const reserved = new Set(["www", "api", "admin", "app", "mail"]);

    if (
      subdomain &&
      !subdomain.includes(".") &&
      !reserved.has(subdomain)
    ) {
      // Generated school subdomains remove hyphens from the stored slug
      // (for example, "bright-future-academy" becomes
      // "brightfutureacademy.school-pilot.app").
      if (/^[a-z0-9]+$/.test(subdomain)) {
        const slugPattern = new RegExp("^" + subdomain.split("").join("-?") + "$", "i");
        const matchingSchools = await School.find({
          isActive: true,
          slug: { $regex: slugPattern },
        })
          .select("_id slug")
          .lean();

        const normalizedMatches = matchingSchools.filter(
          (school) =>
            String(school.slug || "").toLowerCase().replace(/-/g, "") === subdomain
        );

        const schoolMatchesCurrentAccount = normalizedMatches.some(
          (school) => String(school._id) === String(schoolId)
        );

        // Reject ambiguous normalized slugs instead of authorizing one
        // hostname for multiple active schools.
        if (schoolMatchesCurrentAccount && normalizedMatches.length === 1) {
          return origin;
        }
      }
    }
  }

  const bareHostname = hostname.replace(/^www\./, "");
  const school = await School.findOne({
    _id: schoolId,
    "website.customDomain": {
      $in: [hostname, bareHostname, "www." + bareHostname],
    },
    "website.customDomainVerified": true,
    "website.enabled": true,
    isActive: true,
  }).select("_id");

  if (school) {
    return origin;
  }

  throw createError(
    "Payment must be initiated from this school's verified website.",
    400
  );
};

const toKobo = (amount) => Math.round(Number(amount) * 100);

const generatePaymentReference = () =>
  `FEES-${Date.now()}-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

const createError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const savePaymentFailure = async (payment, metadata = {}) => {
  payment.status = "failed";
  payment.metadata = {
    ...(payment.metadata?.toObject?.() || payment.metadata || {}),
    ...metadata,
  };

  await payment.save();
};

/**
 * Initialize a parent's school-fee payment through Paystack.
 * The school's Paystack subaccount receives the school-fee payment.
 */
export const initializeParentSchoolFeePayment = async (req, res) => {
  let payment;

  try {
    const schoolId = getSchoolId(req);
    const { studentFeeAccountId, amount } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    if (!mongoose.isValidObjectId(studentFeeAccountId)) {
      return res.status(400).json({
        message: "A valid student fee account ID is required.",
      });
    }

    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({
        message: "Payment amount is required.",
      });
    }

    const paymentAmount = Number(amount);

    if (
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0 ||
      !Number.isSafeInteger(toKobo(paymentAmount)) ||
      Math.abs(paymentAmount * 100 - Math.round(paymentAmount * 100)) >
        0.000001
    ) {
      return res.status(400).json({
        message:
          "Payment amount must be positive and cannot have more than two decimal places.",
      });
    }

    if (!req.user?._id || !req.user?.email) {
      return res.status(401).json({
        message:
          "An authenticated parent account with a valid email address is required.",
      });
    }

    const school = await School.findById(schoolId).select(
      "name isActive paystackSubaccountCode paystackSubaccountStatus"
    );

    if (!school || !school.isActive) {
      return res.status(404).json({
        message: "School not found or is inactive.",
      });
    }

    if (
      !school.paystackSubaccountCode ||
      school.paystackSubaccountStatus !== "active"
    ) {
      return res.status(409).json({
        message:
          "Online school-fee payments are unavailable. The school must complete its bank payment setup.",
      });
    }

    const feeAccount = await StudentFeeAccount.findOne({
      _id: studentFeeAccountId,
      school: schoolId,
      isActive: true,
    });

    if (!feeAccount) {
      return res.status(404).json({
        message: "Student fee account not found.",
      });
    }

    const student = await Student.findOne({
      _id: feeAccount.student,
      school: schoolId,
      parent: req.user._id,
    });

    if (!student) {
      return res.status(403).json({
        message:
          "You are not authorized to make payments for this student.",
      });
    }

    const outstandingBalance = Number(feeAccount.balance);

    if (
      !Number.isFinite(outstandingBalance) ||
      outstandingBalance <= 0 ||
      feeAccount.status === "paid"
    ) {
      return res.status(400).json({
        message:
          "This student's school fees have already been fully paid.",
      });
    }

    if (toKobo(paymentAmount) > toKobo(outstandingBalance)) {
      return res.status(400).json({
        message: `Payment amount cannot exceed the outstanding balance of ₦${outstandingBalance.toLocaleString(
          "en-NG"
        )}.`,
      });
    }

    // Avoid starting another payment while an earlier one is pending.
    // A database-level constraint is also recommended for concurrent requests.
    const existingPendingPayment = await Payment.findOne({
      school: schoolId,
      studentFeeAccount: feeAccount._id,
      type: "school_fees",
      provider: "paystack",
      status: "pending",
    });

    if (existingPendingPayment) {
      const existingAuthorizationUrl =
        existingPendingPayment.metadata?.paystackAuthorizationUrl;

      // If initialization succeeded previously, let the parent resume the
      // same transaction rather than creating a duplicate payment.
      if (existingAuthorizationUrl) {
        return res.status(200).json({
          message: "Resuming the existing school-fee payment.",
          payment: {
            id: existingPendingPayment._id,
            reference: existingPendingPayment.paymentReference,
            amount: existingPendingPayment.amount,
            status: existingPendingPayment.status,
          },
          authorizationUrl: existingAuthorizationUrl,
          accessCode:
            existingPendingPayment.metadata?.paystackAccessCode || null,
        });
      }

      // Legacy pending records may have been created before Paystack
      // initialization (for example, when origin validation failed).
      // Check Paystack before releasing the pending-payment lock.
      let existingPaystackTransaction;

      try {
        existingPaystackTransaction = await verifyTransaction(
          existingPendingPayment.paymentReference
        );
      } catch (error) {
        // Only treat Paystack's explicit "reference not found" response as
        // proof that this attempt was never initialized. Network/API errors
        // must not unlock the fee account because the outcome is uncertain.
        if (!/transaction reference not found/i.test(error.message || "")) {
          throw createError(
            "Unable to safely check the existing pending payment with Paystack. Please try again shortly.",
            502
          );
        }

        existingPendingPayment.status = "cancelled";
        existingPendingPayment.metadata = {
          ...(existingPendingPayment.metadata?.toObject?.() ||
            existingPendingPayment.metadata ||
            {}),
          cancellationReason:
            "Paystack confirmed that no transaction exists for this reference.",
          cancelledAt: new Date().toISOString(),
        };
        await existingPendingPayment.save();
      }

      if (existingPaystackTransaction) {
        if (existingPaystackTransaction.status === "success") {
          return res.status(409).json({
            message:
              "Paystack reports this payment as successful. Do not pay again. Refresh the fee account and contact the school if the balance has not updated.",
            payment: {
              reference: existingPendingPayment.paymentReference,
              amount: existingPendingPayment.amount,
              status: existingPendingPayment.status,
            },
          });
        }

        if (
          !["abandoned", "failed"].includes(
            existingPaystackTransaction.status
          )
        ) {
          return res.status(409).json({
            message:
              "An existing Paystack transaction may still be active. Please wait or contact the school before starting another payment.",
            payment: {
              reference: existingPendingPayment.paymentReference,
              amount: existingPendingPayment.amount,
              status: existingPendingPayment.status,
            },
          });
        }

        existingPendingPayment.status = "cancelled";
        existingPendingPayment.metadata = {
          ...(existingPendingPayment.metadata?.toObject?.() ||
            existingPendingPayment.metadata ||
            {}),
          cancellationReason: `Paystack transaction status: ${existingPaystackTransaction.status}.`,
          cancelledAt: new Date().toISOString(),
        };
        await existingPendingPayment.save();
      }
    }

    const callbackOrigin = await getPaymentCallbackOrigin(
      req,
      schoolId
    );

    const reference = generatePaymentReference();

    payment = await Payment.create({
      school: schoolId,
      subscription: null,
      studentFeeAccount: feeAccount._id,
      academicSession: feeAccount.academicSession,
      academicTerm: feeAccount.academicTerm,
      type: "school_fees",
      amount: paymentAmount,
      paymentReference: reference,
      provider: "paystack",
      paymentMethod: "paystack",
      status: "pending",
      metadata: {
        student: student._id,
        schoolPaystackSubaccountCode:
          school.paystackSubaccountCode,
        studentId: student.studentId,
        totalAmountDue: feeAccount.totalAmountDue,
        amountPaidBeforePayment: feeAccount.amountPaid,
        balanceBeforePayment: feeAccount.balance,
        requestedAmount: paymentAmount,
        initiatedBy: "parent",
        parent: req.user._id,
      },
    });

    const callbackUrl =
      callbackOrigin + "/dashboard/parent/children/" + student._id + "/fees/callback";

    let paystackResponse;

    try {
      paystackResponse = await initializeTransaction({
        email: req.user.email,
        amount: toKobo(paymentAmount),
        reference,
        callbackUrl,

        // These are transaction fields, not just metadata.
        subaccountCode: school.paystackSubaccountCode,
        bearer: "subaccount",

        metadata: {
          paymentId: payment._id.toString(),
          schoolId: schoolId.toString(),
          studentFeeAccountId: feeAccount._id.toString(),
          studentId: student._id.toString(),
          parentId: req.user._id.toString(),
          type: "school_fees",
        },
      });
    } catch (error) {
      await savePaymentFailure(payment, {
        initializationError:
          error.message || "Paystack initialization failed.",
      });

      console.error(
        "Paystack school-fee initialization failed:",
        error.message
      );

      return res.status(502).json({
        message:
          "Unable to initialize payment with Paystack. Please try again.",
      });
    }

    if (!paystackResponse?.authorization_url) {
      await savePaymentFailure(payment, {
        initializationError:
          "Paystack did not return an authorization URL.",
      });

      return res.status(502).json({
        message:
          "Paystack did not return a payment link. Please try again.",
      });
    }

    // Persist the Paystack link so a parent can resume the same pending
    // transaction if they revisit the payment page before completing it.
    payment.metadata = {
      ...(payment.metadata?.toObject?.() || payment.metadata || {}),
      paystackAuthorizationUrl: paystackResponse.authorization_url,
      paystackAccessCode: paystackResponse.access_code || null,
    };
    await payment.save();

    return res.status(200).json({
      message: "School-fee payment initialized successfully.",
      payment: {
        id: payment._id,
        reference: payment.paymentReference,
        amount: payment.amount,
        status: payment.status,
      },
      authorizationUrl: paystackResponse.authorization_url,
      accessCode: paystackResponse.access_code,
    });
  } catch (error) {
    console.error(
      "Initialize parent school-fee payment error:",
      error.message
    );

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message:
        "Server error while initializing parent school-fee payment.",
    });
  }
};

/**
 * Verify a parent's school-fee payment directly with Paystack.
 * The fee account and payment record are updated atomically.
 */
export const verifyParentSchoolFeePayment = async (req, res) => {
  let session;

  try {
    const schoolId = getSchoolId(req);
    const { reference } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    if (!reference || typeof reference !== "string") {
      return res.status(400).json({
        message: "A valid payment reference is required.",
      });
    }

    if (!req.user?._id) {
      return res.status(401).json({
        message: "Authentication is required.",
      });
    }

    const payment = await Payment.findOne({
      paymentReference: reference,
      school: schoolId,
      type: "school_fees",
      provider: "paystack",
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found.",
      });
    }

    if (!payment.studentFeeAccount) {
      return res.status(400).json({
        message:
          "This payment is not associated with a student fee account.",
      });
    }

    const feeAccount = await StudentFeeAccount.findOne({
      _id: payment.studentFeeAccount,
      school: schoolId,
      isActive: true,
    });

    if (!feeAccount) {
      return res.status(404).json({
        message: "Student fee account not found.",
      });
    }

    const student = await Student.findOne({
      _id: feeAccount.student,
      school: schoolId,
      parent: req.user._id,
    });

    if (!student) {
      return res.status(403).json({
        message:
          "You are not authorized to verify this payment.",
      });
    }

    if (payment.status === "successful") {
      return res.status(200).json({
        message: "Payment has already been verified successfully.",
        payment,
        feeAccount,
      });
    }

    // Never trust the browser callback alone.
    const paystackData = await verifyTransaction(reference);

    if (!paystackData) {
      return res.status(502).json({
        message: "Unable to verify payment with Paystack.",
      });
    }

    if (paystackData.reference !== reference) {
      return res.status(400).json({
        message: "Paystack returned a mismatched payment reference.",
      });
    }

    if (paystackData.status !== "success") {
      const verificationStatus = paystackData.status || "unknown";

      await savePaymentFailure(payment, {
        verificationStatus,
      });

      return res.status(400).json({
        message: "Paystack payment was not successful.",
        status: verificationStatus,
      });
    }

    if (paystackData.currency !== "NGN") {
      await savePaymentFailure(payment, {
        verificationError: "Currency mismatch",
        verifiedCurrency: paystackData.currency || null,
      });

      return res.status(400).json({
        message: "The verified payment currency is not NGN.",
      });
    }

    const verifiedAmount = Number(paystackData.amount) / 100;

    if (
      !Number.isFinite(verifiedAmount) ||
      toKobo(verifiedAmount) !== toKobo(payment.amount)
    ) {
      await savePaymentFailure(payment, {
        verificationError: "Amount mismatch",
        expectedAmount: payment.amount,
        verifiedAmount,
      });

      return res.status(400).json({
        message:
          "Payment amount does not match the expected amount.",
      });
    }

    // Compare the destination when Paystack includes it in its response.
    // If omitted, this field alone cannot prove the settlement destination.
    const verifiedSubaccountCode =
      paystackData.subaccount?.subaccount_code;

    const expectedSubaccountCode =
      payment.metadata?.schoolPaystackSubaccountCode;

    if (
      verifiedSubaccountCode &&
      expectedSubaccountCode &&
      verifiedSubaccountCode !== expectedSubaccountCode
    ) {
      await savePaymentFailure(payment, {
        verificationError: "Subaccount mismatch",
        verifiedSubaccountCode,
      });

      return res.status(400).json({
        message:
          "The verified transaction's subaccount does not match the expected school.",
      });
    }

    session = await mongoose.startSession();

    let result;

    await session.withTransaction(async () => {
      const currentPayment = await Payment.findOne({
        _id: payment._id,
        school: schoolId,
        type: "school_fees",
        provider: "paystack",
      }).session(session);

      if (!currentPayment) {
        throw createError("Payment record no longer exists.", 404);
      }

      // Handles repeated verification requests without applying the
      // same payment to the fee account twice.
      if (currentPayment.status === "successful") {
        const existingFeeAccount =
          await StudentFeeAccount.findById(
            currentPayment.studentFeeAccount
          ).session(session);

        result = {
          alreadyProcessed: true,
          payment: currentPayment,
          feeAccount: existingFeeAccount,
        };

        return;
      }

      const currentFeeAccount =
        await StudentFeeAccount.findOne({
          _id: currentPayment.studentFeeAccount,
          school: schoolId,
          isActive: true,
        }).session(session);

      if (!currentFeeAccount) {
        throw createError("Student fee account not found.", 404);
      }

      const currentBalanceKobo = toKobo(currentFeeAccount.balance);
      const paymentAmountKobo = toKobo(currentPayment.amount);

      if (currentBalanceKobo <= 0) {
        throw createError(
          "The fee account is already paid. Manual reconciliation is required.",
          409
        );
      }

      if (paymentAmountKobo > currentBalanceKobo) {
        throw createError(
          "The payment would cause an overpayment. Manual reconciliation is required.",
          409
        );
      }

      const amountPaidBefore = Number(currentFeeAccount.amountPaid || 0);
      const newAmountPaidKobo =
        toKobo(amountPaidBefore) + paymentAmountKobo;

      const totalDueKobo = toKobo(currentFeeAccount.totalAmountDue);
      const newBalanceKobo = Math.max(
        totalDueKobo - newAmountPaidKobo,
        0
      );

      currentFeeAccount.amountPaid = newAmountPaidKobo / 100;
      currentFeeAccount.balance = newBalanceKobo / 100;

      if (newBalanceKobo === 0) {
        currentFeeAccount.status = "paid";
      } else if (newAmountPaidKobo > 0) {
        currentFeeAccount.status = "partial";
      } else {
        currentFeeAccount.status = "unpaid";
      }

      currentPayment.status = "successful";
      currentPayment.paidAt = new Date();
      currentPayment.paystackTransactionId =
        paystackData.id != null ? String(paystackData.id) : null;

      currentPayment.metadata = {
        ...(currentPayment.metadata?.toObject?.() ||
          currentPayment.metadata ||
          {}),
        verifiedAmount,
        verifiedCurrency: paystackData.currency,
        paystackStatus: paystackData.status,
        amountPaidBefore,
        amountPaidAfter: newAmountPaidKobo / 100,
        balanceAfterPayment: newBalanceKobo / 100,
        verifiedAt: new Date().toISOString(),
      };

      await currentFeeAccount.save({ session });
      await currentPayment.save({ session });

      result = {
        alreadyProcessed: false,
        payment: currentPayment,
        feeAccount: currentFeeAccount,
      };
    });

    return res.status(200).json({
      message: result.alreadyProcessed
        ? "Payment has already been verified successfully."
        : "School-fee payment verified successfully.",
      payment: result.payment,
      feeAccount: result.feeAccount,
    });
  } catch (error) {
    console.error(
      "Verify parent school-fee payment error:",
      error.message
    );

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message:
        "Server error while verifying parent school-fee payment.",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};
