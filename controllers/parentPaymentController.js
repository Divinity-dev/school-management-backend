import Payment from "../models/Payment.js";
import StudentFeeAccount from "../models/StudentFeeAccount.js";
import Student from "../models/Student.js";
import {
  initializeTransaction,
  verifyTransaction,
} from "../utils/paystack.js";

const getSchoolId = (req) =>
  req.user?.school?._id || req.user?.school;

export const initializeParentSchoolFeePayment = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const {
      studentFeeAccountId,
      amount,
    } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    if (!studentFeeAccountId || amount === undefined) {
      return res.status(400).json({
        message:
          "Student fee account and payment amount are required.",
      });
    }

    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        message: "Payment amount must be greater than zero.",
      });
    }

    // Find the fee account and make sure it belongs
    // to the parent's school.
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

    // Verify that the student attached to this fee account
    // actually belongs to the logged-in parent.
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

    if (feeAccount.balance <= 0 || feeAccount.status === "paid") {
      return res.status(400).json({
        message: "This student's school fees have already been fully paid.",
      });
    }

    if (paymentAmount > feeAccount.balance) {
      return res.status(400).json({
        message: `Payment amount cannot exceed the outstanding balance of ₦${feeAccount.balance.toLocaleString()}.`,
      });
    }

    // Prevent multiple pending Paystack payments for the
    // same fee account.
    const existingPendingPayment = await Payment.findOne({
      school: schoolId,
      studentFeeAccount: feeAccount._id,
      type: "school_fees",
      provider: "paystack",
      status: "pending",
    });

    if (existingPendingPayment) {
      return res.status(400).json({
        message:
          "There is already a pending payment for this student's school fees.",
        payment: {
          reference: existingPendingPayment.paymentReference,
          amount: existingPendingPayment.amount,
        },
      });
    }

    const reference = `FEES-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 10)
      .toUpperCase()}`;

    const payment = await Payment.create({
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
        studentId: student.studentId,
        totalAmountDue: feeAccount.totalAmountDue,
        amountPaidBeforePayment: feeAccount.amountPaid,
        balanceBeforePayment: feeAccount.balance,
        requestedAmount: paymentAmount,
        initiatedBy: "parent",
        parent: req.user._id,
      },
    });

    try {
      const paystackResponse = await initializeTransaction({
        email: req.user.email,
        amount: Math.round(paymentAmount * 100),
        reference,
        metadata: {
          paymentId: payment._id.toString(),
          schoolId: schoolId.toString(),
          studentFeeAccountId: feeAccount._id.toString(),
          studentId: student._id.toString(),
          parentId: req.user._id.toString(),
          type: "school_fees",
        },
      });

      return res.status(200).json({
        message: "Parent school fee payment initialized successfully.",
        payment: {
          id: payment._id,
          reference: payment.paymentReference,
          amount: payment.amount,
          status: payment.status,
        },
        authorizationUrl: paystackResponse.authorization_url,
        accessCode: paystackResponse.access_code,
      });
    } catch (paystackError) {
      // If Paystack initialization fails, don't leave
      // an unusable pending payment behind.
      payment.status = "failed";

      payment.metadata = {
        ...payment.metadata,
        initializationError:
          paystackError?.message || "Paystack initialization failed.",
      };

      await payment.save();

      throw paystackError;
    }
  } catch (error) {
    console.error(
      "Initialize parent school fee payment error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while initializing parent school fee payment.",
    });
  }
};

export const verifyParentSchoolFeePayment = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { reference } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    if (!reference) {
      return res.status(400).json({
        message: "Payment reference is required.",
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

    // Verify that this payment belongs to a child of the
    // currently authenticated parent.
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

    // Idempotency: if the payment has already been
    // successfully processed, simply return the current state.
    if (payment.status === "successful") {
      return res.status(200).json({
        message: "Payment has already been verified successfully.",
        payment,
        feeAccount,
      });
    }

    const paystackData = await verifyTransaction(reference);

    if (!paystackData) {
      return res.status(400).json({
        message: "Unable to verify payment with Paystack.",
      });
    }

    const verifiedAmount = Number(paystackData.amount) / 100;
    const verifiedStatus = paystackData.status;

    if (verifiedStatus !== "success") {
      payment.status = "failed";

      payment.metadata = {
        ...payment.metadata,
        verificationStatus: verifiedStatus,
      };

      await payment.save();

      return res.status(400).json({
        message: "Paystack payment was not successful.",
        status: verifiedStatus,
      });
    }

    if (verifiedAmount !== payment.amount) {
      payment.status = "failed";

      payment.metadata = {
        ...payment.metadata,
        verificationError: "Amount mismatch",
        expectedAmount: payment.amount,
        verifiedAmount,
      };

      await payment.save();

      return res.status(400).json({
        message:
          "Payment amount does not match the expected amount.",
      });
    }

    // Re-read the fee account before applying the payment.
    const currentFeeAccount = await StudentFeeAccount.findOne({
      _id: payment.studentFeeAccount,
      school: schoolId,
      isActive: true,
    });

    if (!currentFeeAccount) {
      return res.status(404).json({
        message: "Student fee account no longer exists.",
      });
    }

    if (currentFeeAccount.balance <= 0) {
      payment.status = "failed";

      payment.metadata = {
        ...payment.metadata,
        verificationError:
          "Fee account was already fully paid before verification.",
      };

      await payment.save();

      return res.status(400).json({
        message:
          "This student's school fees have already been fully paid.",
      });
    }

    if (payment.amount > currentFeeAccount.balance) {
      payment.status = "failed";

      payment.metadata = {
        ...payment.metadata,
        verificationError: "Payment would cause overpayment",
        currentBalance: currentFeeAccount.balance,
      };

      await payment.save();

      return res.status(400).json({
        message:
          "This payment would exceed the student's outstanding balance.",
      });
    }

    const amountPaidBefore = currentFeeAccount.amountPaid;
    const newAmountPaid =
      amountPaidBefore + payment.amount;

    const newBalance =
      currentFeeAccount.totalAmountDue - newAmountPaid;

    currentFeeAccount.amountPaid = newAmountPaid;
    currentFeeAccount.balance = Math.max(newBalance, 0);

    if (currentFeeAccount.balance === 0) {
      currentFeeAccount.status = "paid";
    } else if (currentFeeAccount.amountPaid > 0) {
      currentFeeAccount.status = "partial";
    } else {
      currentFeeAccount.status = "unpaid";
    }

    await currentFeeAccount.save();

    payment.status = "successful";
    payment.paidAt = new Date();
    payment.paystackTransactionId =
      paystackData.id?.toString() || null;

    payment.metadata = {
      ...payment.metadata,
      verifiedAmount,
      paystackStatus: verifiedStatus,
      amountPaidBefore,
      amountPaidAfter: currentFeeAccount.amountPaid,
      balanceAfterPayment: currentFeeAccount.balance,
    };

    await payment.save();

    return res.status(200).json({
      message: "School fee payment verified successfully.",
      payment,
      feeAccount: currentFeeAccount,
    });
  } catch (error) {
    console.error(
      "Verify parent school fee payment error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while verifying parent school fee payment.",
    });
  }
};