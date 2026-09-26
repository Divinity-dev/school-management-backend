import crypto from "crypto";
import mongoose from "mongoose";

import Payment from "../models/Payment.js";
import Subscription from "../models/Subscription.js";
import StudentFeeAccount from "../models/StudentFeeAccount.js";
import AcademicSession from "../models/AcademicSession.js";
import AcademicTerm from "../models/AcademicTerm.js";

import {
  initializeTransaction,
  verifyTransaction,
} from "../utils/paystack.js";

const PRICE_PER_STUDENT = 1000;

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

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
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
};

const buildPaystackMetadata = (transaction) => ({
  paystackTransactionId:
    transaction.id?.toString() || null,

  paystackStatus:
    transaction.status || null,

  channel:
    transaction.channel || null,

  currency:
    transaction.currency || null,

  customerEmail:
    transaction.customer?.email || null,
});

/*
|--------------------------------------------------------------------------
| Process successful subscription payment
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| There is NO pending Subscription.
|
| Initial subscription:
|
| Payment (pending)
|       ↓
| Paystack success
|       ↓
| Payment (successful)
|       ↓
| Subscription (active)
|
|--------------------------------------------------------------------------
*/

export const processSuccessfulSubscriptionPayment =
  async ({ paymentId, transaction }) => {
    const session = await mongoose.startSession();

    try {
      let result;

      await session.withTransaction(async () => {
        const payment = await Payment.findById(
          paymentId
        ).session(session);

        if (!payment) {
          throw new Error("PAYMENT_NOT_FOUND");
        }

        /*
        |--------------------------------------------------------------------------
        | Idempotency
        |--------------------------------------------------------------------------
        */

        if (payment.status === "successful") {
          let subscription = null;

          if (payment.subscription) {
            subscription =
              await Subscription.findById(
                payment.subscription
              ).session(session);
          }

          /*
          |----------------------------------------------------------------------
          | Recovery in case payment succeeded but subscription link was missing.
          |----------------------------------------------------------------------
          */

          if (
            !subscription &&
            payment.type === "initial_subscription"
          ) {
            subscription =
              await Subscription.findOne({
                school: payment.school,
                academicSession:
                  payment.academicSession,
                academicTerm:
                  payment.academicTerm,
              }).session(session);

            if (subscription) {
              payment.subscription =
                subscription._id;

              await payment.save({
                session,
              });
            }
          }

          result = {
            alreadyProcessed: true,
            payment,
            subscription,
          };

          return;
        }

        if (!transaction) {
          throw new Error(
            "PAYMENT_NOT_SUCCESSFUL"
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Payment reference validation
        |--------------------------------------------------------------------------
        */

        if (
          transaction.reference !==
          payment.paymentReference
        ) {
          throw new Error(
            "PAYMENT_REFERENCE_MISMATCH"
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Currency validation
        |--------------------------------------------------------------------------
        */

        if (transaction.currency !== "NGN") {
          payment.status = "failed";

          payment.metadata = {
            ...(payment.metadata || {}),
            failureReason:
              "Invalid payment currency.",
            paystackCurrency:
              transaction.currency,
          };

          await payment.save({
            session,
          });

          throw new Error(
            "PAYMENT_CURRENCY_MISMATCH"
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Transaction status
        |--------------------------------------------------------------------------
        */

        if (transaction.status !== "success") {
          if (transaction.status === "abandoned") {
            payment.status = "cancelled";

            payment.metadata = {
              ...(payment.metadata || {}),
              paystackStatus:
                transaction.status,
              failureReason:
                "Paystack checkout was abandoned.",
            };

            await payment.save({
              session,
            });

            throw new Error(
              "PAYMENT_ABANDONED"
            );
          }

          payment.status = "failed";

          payment.metadata = {
            ...(payment.metadata || {}),
            paystackStatus:
              transaction.status,
            failureReason:
              "Paystack transaction was not successful.",
          };

          await payment.save({
            session,
          });

          throw new Error(
            "PAYMENT_NOT_SUCCESSFUL"
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Amount validation
        |--------------------------------------------------------------------------
        */

        const expectedAmountInKobo =
          Math.round(
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
            paystackAmount:
              transaction.amount,
            expectedAmount:
              expectedAmountInKobo,
          };

          await payment.save({
            session,
          });

          throw new Error(
            "PAYMENT_AMOUNT_MISMATCH"
          );
        }

        /*
        |--------------------------------------------------------------------------
        | INITIAL SUBSCRIPTION
        |--------------------------------------------------------------------------
        */

        if (
          payment.type ===
          "initial_subscription"
        ) {
          const studentLimit = Number(
            payment.studentSeatsPurchased ||
              payment.metadata?.studentLimit
          );

          if (
            !Number.isInteger(
              studentLimit
            ) ||
            studentLimit <= 0
          ) {
            throw new Error(
              "INVALID_STUDENT_SEAT_QUANTITY"
            );
          }

          /*
          |----------------------------------------------------------------------
          | Server-side pricing validation
          |----------------------------------------------------------------------
          */

          const expectedAmount =
            studentLimit *
            PRICE_PER_STUDENT;

          if (
            Number(payment.amount) !==
            expectedAmount
          ) {
            payment.status = "failed";

            payment.metadata = {
              ...(payment.metadata || {}),
              failureReason:
                "Subscription amount does not match the number of seats.",
              studentLimit,
              expectedAmount,
            };

            await payment.save({
              session,
            });

            throw new Error(
              "PAYMENT_AMOUNT_MISMATCH"
            );
          }

          /*
          |----------------------------------------------------------------------
          | Validate academic session
          |----------------------------------------------------------------------
          */

          const academicSession =
            await AcademicSession.findOne({
              _id:
                payment.academicSession,
              school:
                payment.school,
            }).session(session);

          if (!academicSession) {
            throw new Error(
              "ACADEMIC_SESSION_NOT_FOUND"
            );
          }

          /*
          |----------------------------------------------------------------------
          | Validate academic term
          |----------------------------------------------------------------------
          */

          const academicTerm =
            await AcademicTerm.findOne({
              _id:
                payment.academicTerm,
              school:
                payment.school,
            }).session(session);

          if (!academicTerm) {
            throw new Error(
              "ACADEMIC_TERM_NOT_FOUND"
            );
          }

          /*
          |----------------------------------------------------------------------
          | Check whether a subscription already exists.
          |
          | The Subscription schema has a unique index on:
          | school + academicSession + academicTerm
          |
          | Therefore there can only be one.
          |----------------------------------------------------------------------
          */

          const existingSubscription =
            await Subscription.findOne({
              school:
                payment.school,
              academicSession:
                payment.academicSession,
              academicTerm:
                payment.academicTerm,
            }).session(session);

          /*
          |----------------------------------------------------------------------
          | This payment should normally never reach this point if another
          | subscription already exists, because initialization prevents it.
          |
          | If it does happen, do NOT silently consume the payment.
          |----------------------------------------------------------------------
          */

          if (existingSubscription) {
            throw new Error(
              "SUBSCRIPTION_ALREADY_EXISTS"
            );
          }

          /*
          |----------------------------------------------------------------------
          | Create the subscription ONLY NOW.
          |
          | This is the first moment a Subscription document exists.
          |----------------------------------------------------------------------
          */

          const startsAt =
            academicTerm.startsAt ||
            academicTerm.startDate ||
            new Date();

          const expiresAt =
            academicTerm.endsAt ||
            academicTerm.endDate ||
            null;

          const [
            subscription,
          ] = await Subscription.create(
            [
              {
                school:
                  payment.school,

                academicSession:
                  payment.academicSession,

                academicTerm:
                  payment.academicTerm,

                studentLimit,

                amount:
                  Number(payment.amount),

                status:
                  "active",

                startsAt,

                expiresAt,

                activatedAt:
                  new Date(),
              },
            ],
            {
              session,
            }
          );

          /*
          |----------------------------------------------------------------------
          | Mark payment successful
          |----------------------------------------------------------------------
          */

          payment.subscription =
            subscription._id;

          payment.status =
            "successful";

          payment.paidAt =
            new Date();

          payment.paystackTransactionId =
            transaction.id
              ?.toString() || null;

          payment.metadata = {
            ...(payment.metadata || {}),

            ...buildPaystackMetadata(
              transaction
            ),

            processedAt:
              new Date(),

            subscriptionId:
              subscription._id.toString(),

            studentLimit,
          };

          await payment.save({
            session,
          });

          result = {
            alreadyProcessed: false,
            payment,
            subscription,
          };

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | ADDITIONAL SEATS
        |--------------------------------------------------------------------------
        */

        if (
          payment.type ===
          "additional_seats"
        ) {
          if (!payment.subscription) {
            throw new Error(
              "SUBSCRIPTION_NOT_FOUND"
            );
          }

          const subscription =
            await Subscription.findOne({
              _id:
                payment.subscription,

              school:
                payment.school,

              status:
                "active",
            }).session(session);

          if (!subscription) {
            throw new Error(
              "SUBSCRIPTION_NOT_FOUND"
            );
          }

          const additionalSeats =
            Number(
              payment.studentSeatsPurchased ||
                payment.metadata
                  ?.additionalSeats
            );

          if (
            !Number.isInteger(
              additionalSeats
            ) ||
            additionalSeats <= 0
          ) {
            throw new Error(
              "INVALID_ADDITIONAL_SEAT_QUANTITY"
            );
          }

          const expectedAmount =
            additionalSeats *
            PRICE_PER_STUDENT;

          if (
            Number(payment.amount) !==
            expectedAmount
          ) {
            payment.status = "failed";

            payment.metadata = {
              ...(payment.metadata || {}),
              failureReason:
                "Additional-seat payment amount does not match the seat quantity.",
              additionalSeats,
              expectedAmount,
            };

            await payment.save({
              session,
            });

            throw new Error(
              "PAYMENT_AMOUNT_MISMATCH"
            );
          }

          /*
          |----------------------------------------------------------------------
          | Update subscription only after successful payment.
          |----------------------------------------------------------------------
          */

          subscription.studentLimit +=
            additionalSeats;

          subscription.amount +=
            Number(payment.amount);

          await subscription.save({
            session,
          });

          payment.status =
            "successful";

          payment.paidAt =
            new Date();

          payment.paystackTransactionId =
            transaction.id
              ?.toString() || null;

          payment.metadata = {
            ...(payment.metadata || {}),

            ...buildPaystackMetadata(
              transaction
            ),

            processedAt:
              new Date(),

            additionalSeats,

            subscriptionId:
              subscription._id.toString(),
          };

          await payment.save({
            session,
          });

          result = {
            alreadyProcessed: false,
            payment,
            subscription,
          };

          return;
        }

        throw new Error(
          `UNSUPPORTED_PAYMENT_TYPE:${payment.type}`
        );
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
*/

const processSuccessfulSchoolFeePayment =
  async ({
    paymentId,
    transaction,
  }) => {
    const session =
      await mongoose.startSession();

    try {
      let result;

      await session.withTransaction(
        async () => {
          const payment =
            await Payment.findById(
              paymentId
            ).session(session);

          if (!payment) {
            throw new Error(
              "PAYMENT_NOT_FOUND"
            );
          }

          if (
            payment.status ===
            "successful"
          ) {
            const feeAccount =
              await StudentFeeAccount.findOne(
                {
                  _id:
                    payment.studentFeeAccount,

                  school:
                    payment.school,
                }
              ).session(session);

            result = {
              alreadyProcessed:
                true,

              payment,

              feeAccount,
            };

            return;
          }

          if (
            payment.type !==
            "school_fees"
          ) {
            throw new Error(
              "INVALID_PAYMENT_TYPE"
            );
          }

          if (!transaction) {
            throw new Error(
              "PAYMENT_NOT_SUCCESSFUL"
            );
          }

          if (
            transaction.reference !==
            payment.paymentReference
          ) {
            throw new Error(
              "PAYMENT_REFERENCE_MISMATCH"
            );
          }

          if (
            transaction.currency !==
            "NGN"
          ) {
            payment.status =
              "failed";

            payment.metadata = {
              ...(payment.metadata ||
                {}),

              failureReason:
                "Invalid payment currency.",

              paystackCurrency:
                transaction.currency,
            };

            await payment.save({
              session,
            });

            throw new Error(
              "PAYMENT_CURRENCY_MISMATCH"
            );
          }

          if (
            transaction.status !==
            "success"
          ) {
            if (
              transaction.status ===
              "abandoned"
            ) {
              payment.status =
                "cancelled";

              payment.metadata = {
                ...(payment.metadata ||
                  {}),

                paystackStatus:
                  transaction.status,

                failureReason:
                  "Paystack checkout was abandoned.",
              };

              await payment.save({
                session,
              });

              throw new Error(
                "PAYMENT_ABANDONED"
              );
            }

            payment.status =
              "failed";

            payment.metadata = {
              ...(payment.metadata ||
                {}),

              paystackStatus:
                transaction.status,

              failureReason:
                "Paystack transaction was not successful.",
            };

            await payment.save({
              session,
            });

            throw new Error(
              "PAYMENT_NOT_SUCCESSFUL"
            );
          }

          const expectedAmountInKobo =
            Math.round(
              Number(payment.amount) *
                100
            );

          if (
            Number(
              transaction.amount
            ) !==
            expectedAmountInKobo
          ) {
            payment.status =
              "failed";

            payment.metadata = {
              ...(payment.metadata ||
                {}),

              failureReason:
                "Payment amount does not match the expected amount.",

              paystackAmount:
                transaction.amount,

              expectedAmount:
                expectedAmountInKobo,
            };

            await payment.save({
              session,
            });

            throw new Error(
              "PAYMENT_AMOUNT_MISMATCH"
            );
          }

          const feeAccount =
            await StudentFeeAccount.findOne(
              {
                _id:
                  payment.studentFeeAccount,

                school:
                  payment.school,

                isActive:
                  true,
              }
            ).session(session);

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

          if (
            currentBalance <= 0
          ) {
            payment.metadata = {
              ...(payment.metadata ||
                {}),

              ...buildPaystackMetadata(
                transaction
              ),

              reconciliationRequired:
                true,

              reconciliationReason:
                "Paystack payment succeeded but the fee account was already fully paid.",
            };

            await payment.save({
              session,
            });

            throw new Error(
              "FEE_ACCOUNT_ALREADY_PAID"
            );
          }

          if (
            Number(payment.amount) >
            currentBalance
          ) {
            payment.status =
              "failed";

            payment.metadata = {
              ...(payment.metadata ||
                {}),

              failureReason:
                "Payment amount exceeds the current outstanding balance.",

              currentBalance,

              paystackAmount:
                transaction.amount,
            };

            await payment.save({
              session,
            });

            throw new Error(
              "PAYMENT_EXCEEDS_BALANCE"
            );
          }

          const newAmountPaid =
            Number(
              feeAccount.amountPaid
            ) +
            Number(
              payment.amount
            );

          const newBalance =
            Number(
              feeAccount.totalAmountDue
            ) -
            newAmountPaid;

          feeAccount.amountPaid =
            newAmountPaid;

          feeAccount.balance =
            Math.max(
              0,
              newBalance
            );

          if (
            feeAccount.balance ===
            0
          ) {
            feeAccount.status =
              "paid";
          } else if (
            feeAccount.amountPaid >
            0
          ) {
            feeAccount.status =
              "partial";
          } else {
            feeAccount.status =
              "unpaid";
          }

          payment.status =
            "successful";

          payment.paidAt =
            new Date();

          payment.paystackTransactionId =
            transaction.id
              ?.toString() ||
            null;

          payment.metadata = {
            ...(payment.metadata ||
              {}),

            ...buildPaystackMetadata(
              transaction
            ),
          };

          await feeAccount.save({
            session,
          });

          await payment.save({
            session,
          });

          result = {
            alreadyProcessed:
              false,

            payment,

            feeAccount,
          };
        }
      );

      return result;
    } finally {
      await session.endSession();
    }
  };

/*
|--------------------------------------------------------------------------
| Initialize subscription payment
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| This does NOT create a Subscription.
|
| It creates only a pending Payment.
|--------------------------------------------------------------------------
*/

export const initializeSubscriptionPayment =
  async (req, res) => {
    let payment = null;

    try {
      const schoolId =
        getSchoolId(req);

      const {
        academicSessionId,
        academicTermId,
        studentLimit,
      } = req.body;

      if (!schoolId) {
        return res.status(400).json({
          message:
            "User is not associated with a school.",
        });
      }

      if (
        !academicSessionId ||
        !isValidObjectId(
          academicSessionId
        )
      ) {
        return res.status(400).json({
          message:
            "A valid academic session ID is required.",
        });
      }

      if (
        !academicTermId ||
        !isValidObjectId(
          academicTermId
        )
      ) {
        return res.status(400).json({
          message:
            "A valid academic term ID is required.",
        });
      }

      const seats =
        Number(studentLimit);

      if (
        !Number.isInteger(seats) ||
        seats <= 0
      ) {
        return res.status(400).json({
          message:
            "Student limit must be a positive whole number.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Validate session
      |--------------------------------------------------------------------------
      */

      const academicSession =
        await AcademicSession.findOne({
          _id:
            academicSessionId,

          school:
            schoolId,
        });

      if (!academicSession) {
        return res.status(404).json({
          message:
            "Academic session not found.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Validate term
      |--------------------------------------------------------------------------
      */

      const academicTerm =
        await AcademicTerm.findOne({
          _id:
            academicTermId,

          school:
            schoolId,
        });

      if (!academicTerm) {
        return res.status(404).json({
          message:
            "Academic term not found.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | IMPORTANT:
      | If a subscription already exists, do not create another payment.
      |--------------------------------------------------------------------------
      */

      const existingSubscription =
        await Subscription.findOne({
          school:
            schoolId,

          academicSession:
            academicSessionId,

          academicTerm:
            academicTermId,
        });

      if (existingSubscription) {
        return res.status(409).json({
          message:
            "A subscription already exists for this academic term.",

          subscription:
            existingSubscription,
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Existing pending initial payment
      |--------------------------------------------------------------------------
      */

      const existingPayment =
        await Payment.findOne({
          school:
            schoolId,

          academicSession:
            academicSessionId,

          academicTerm:
            academicTermId,

          type:
            "initial_subscription",

          provider:
            "paystack",

          status:
            "pending",
        });

      if (existingPayment) {
        return res.status(200).json({
          message:
            "A pending subscription payment already exists.",

          payment: {
            id:
              existingPayment._id,

            reference:
              existingPayment.paymentReference,

            amount:
              existingPayment.amount,

            studentLimit:
              existingPayment.studentSeatsPurchased,

            status:
              existingPayment.status,
          },
        });
      }

      const amount =
        seats *
        PRICE_PER_STUDENT;

      const email =
        req.user?.email;

      if (!email) {
        return res.status(400).json({
          message:
            "Authenticated user's email is required for payment.",
        });
      }

      const paymentReference =
        generatePaymentReference(
          "SUB"
        );

      /*
      |--------------------------------------------------------------------------
      | Create ONLY the Payment
      |--------------------------------------------------------------------------
      */

      payment =
        await Payment.create({
          school:
            schoolId,

          subscription:
            null,

          studentFeeAccount:
            null,

          academicSession:
            academicSessionId,

          academicTerm:
            academicTermId,

          type:
            "initial_subscription",

          amount,

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
            studentLimit:
              seats,

            pricePerStudent:
              PRICE_PER_STUDENT,

            requestedAmount:
              amount,
          },
        });

      const callbackUrl =
        process.env
          .PAYSTACK_CALLBACK_URL;

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
            email,

            amount:
              Math.round(
                amount * 100
              ),

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

              studentLimit:
                seats,

              type:
                "initial_subscription",
            },
          });

        return res.status(200).json({
          message:
            "Subscription payment initialized successfully.",

          payment: {
            id:
              payment._id,

            reference:
              payment.paymentReference,

            amount:
              payment.amount,

            studentLimit:
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
          ...(payment.metadata ||
            {}),

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

      if (
        error?.code ===
        11000
      ) {
        return res.status(409).json({
          message:
            "A pending subscription payment already exists for this academic term.",
        });
      }

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

export const verifySubscriptionPayment =
  async (req, res) => {
    try {
      const schoolId =
        getSchoolId(req);

      const {
        reference,
      } = req.params;

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

      if (
        payment.status ===
        "successful"
      ) {
        const subscription =
          await Subscription.findById(
            payment.subscription
          );

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

      const transaction =
        await verifyTransaction(
          reference.trim()
        );

      try {
        const result =
          await processSuccessfulSubscriptionPayment(
            {
              paymentId:
                payment._id,

              transaction,
            }
          );

        return res.status(200).json({
          message:
            result.alreadyProcessed
              ? "Subscription payment has already been processed."
              : "Subscription payment verified and subscription activated successfully.",

          payment:
            result.payment,

          subscription:
            result.subscription,
        });
      } catch (error) {
        switch (error.message) {
          case "PAYMENT_AMOUNT_MISMATCH":
            return res.status(400).json({
              message:
                "Payment amount does not match the expected amount.",
            });

          case "PAYMENT_REFERENCE_MISMATCH":
            return res.status(400).json({
              message:
                "Payment reference mismatch.",
            });

          case "PAYMENT_CURRENCY_MISMATCH":
            return res.status(400).json({
              message:
                "Invalid payment currency.",
            });

          case "PAYMENT_ABANDONED":
            return res.status(400).json({
              message:
                "Payment was abandoned. No subscription was created.",

              paymentStatus:
                "cancelled",

              payment,
            });

          case "PAYMENT_NOT_SUCCESSFUL":
            return res.status(400).json({
              message:
                "Payment was not successful. No subscription was created.",

              status:
                transaction.status,

              payment,
            });

          case "ACADEMIC_SESSION_NOT_FOUND":
            return res.status(404).json({
              message:
                "Academic session associated with the payment was not found.",
            });

          case "ACADEMIC_TERM_NOT_FOUND":
            return res.status(404).json({
              message:
                "Academic term associated with the payment was not found.",
            });

          case "INVALID_STUDENT_SEAT_QUANTITY":
            return res.status(400).json({
              message:
                "Invalid student seat quantity.",
            });

          case "SUBSCRIPTION_ALREADY_EXISTS":
            return res.status(409).json({
              message:
                "A subscription already exists for this academic term. The payment requires reconciliation.",
            });

          default:
            throw error;
        }
      }
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
| Initialize school-fee payment
|--------------------------------------------------------------------------
*/

export const initializeSchoolFeePayment =
  async (req, res) => {
    let payment = null;

    try {
      const schoolId =
        getSchoolId(req);

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

      const paymentAmount =
        Number(amount);

      if (
        !Number.isFinite(
          paymentAmount
        ) ||
        paymentAmount <= 0
      ) {
        return res.status(400).json({
          message:
            "Payment amount must be greater than zero.",
        });
      }

      const feeAccount =
        await StudentFeeAccount.findOne({
          _id:
            studentFeeAccountId,

          school:
            schoolId,

          isActive:
            true,
        });

      if (!feeAccount) {
        return res.status(404).json({
          message:
            "Student fee account not found.",
        });
      }

      const outstandingBalance =
        Number(
          feeAccount.totalAmountDue
        ) -
        Number(
          feeAccount.amountPaid
        );

      if (
        outstandingBalance <= 0 ||
        feeAccount.status ===
          "paid"
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

      const email =
        req.user?.email;

      if (!email) {
        return res.status(400).json({
          message:
            "Authenticated user's email is required for payment.",
        });
      }

      const existingPayment =
        await Payment.findOne({
          school:
            schoolId,

          studentFeeAccount:
            feeAccount._id,

          type:
            "school_fees",

          provider:
            "paystack",

          status:
            "pending",
        });

      if (existingPayment) {
        return res.status(200).json({
          message:
            "A pending payment already exists for this student fee account.",

          payment: {
            id:
              existingPayment._id,

            reference:
              existingPayment.paymentReference,

            amount:
              existingPayment.amount,

            status:
              existingPayment.status,
          },
        });
      }

      const paymentReference =
        generatePaymentReference(
          "FEES"
        );

      payment =
        await Payment.create({
          school:
            schoolId,

          subscription:
            null,

          studentFeeAccount:
            feeAccount._id,

          academicSession:
            feeAccount.academicSession,

          academicTerm:
            feeAccount.academicTerm,

          type:
            "school_fees",

          amount:
            paymentAmount,

          studentSeatsPurchased:
            null,

          paymentReference,

          provider:
            "paystack",

          paymentMethod:
            "paystack",

          status:
            "pending",

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

      const callbackUrl =
        process.env
          .PAYSTACK_CALLBACK_URL;

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
            email,

            amount:
              Math.round(
                paymentAmount *
                  100
              ),

            reference:
              paymentReference,

            callbackUrl,

            metadata: {
              paymentId:
                payment._id.toString(),

              studentFeeAccountId:
                feeAccount._id.toString(),

              studentId:
                feeAccount.student.toString(),

              schoolId:
                schoolId.toString(),

              type:
                "school_fees",
            },
          });

        return res.status(200).json({
          message:
            "School fee payment initialized successfully.",

          payment: {
            id:
              payment._id,

            reference:
              payment.paymentReference,

            amount:
              payment.amount,

            status:
              payment.status,

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
        payment.status =
          "failed";

        payment.metadata = {
          ...(payment.metadata ||
            {}),

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

      if (
        error?.code ===
        11000
      ) {
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

export const verifySchoolFeePayment =
  async (req, res) => {
    try {
      const schoolId =
        getSchoolId(req);

      const {
        reference,
      } = req.params;

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
            "school_fees",
        });

      if (!payment) {
        return res.status(404).json({
          message:
            "School fee payment not found.",
        });
      }

      if (
        payment.status ===
        "successful"
      ) {
        const feeAccount =
          await StudentFeeAccount.findOne(
            {
              _id:
                payment.studentFeeAccount,

              school:
                schoolId,
            }
          );

        return res.status(200).json({
          message:
            "Payment has already been verified successfully.",

          payment,

          studentFeeAccount:
            feeAccount,
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

      try {
        const result =
          await processSuccessfulSchoolFeePayment(
            {
              paymentId:
                payment._id,

              transaction,
            }
          );

        return res.status(200).json({
          message:
            result.alreadyProcessed
              ? "Payment has already been processed successfully."
              : "School fee payment verified and fee account updated successfully.",

          payment:
            result.payment,

          studentFeeAccount:
            result.feeAccount,
        });
      } catch (error) {
        switch (error.message) {
          case "PAYMENT_AMOUNT_MISMATCH":
            return res.status(400).json({
              message:
                "Payment amount does not match the expected amount.",
            });

          case "PAYMENT_REFERENCE_MISMATCH":
            return res.status(400).json({
              message:
                "Payment reference mismatch.",
            });

          case "PAYMENT_CURRENCY_MISMATCH":
            return res.status(400).json({
              message:
                "Invalid payment currency.",
            });

          case "PAYMENT_NOT_SUCCESSFUL":
            return res.status(400).json({
              message:
                "Payment was not successful.",

              status:
                transaction.status,
            });

          case "PAYMENT_ABANDONED":
            return res.status(400).json({
              message:
                "Payment was abandoned. No amount was added to the fee account.",

              paymentStatus:
                "cancelled",
            });

          case "FEE_ACCOUNT_NOT_FOUND":
            return res.status(404).json({
              message:
                "Student fee account associated with this payment was not found.",
            });

          case "PAYMENT_EXCEEDS_BALANCE":
            return res.status(400).json({
              message:
                "Payment amount exceeds the student's outstanding balance.",
            });

          case "FEE_ACCOUNT_ALREADY_PAID":
            return res.status(409).json({
              message:
                "The Paystack payment was successful, but the fee account is already fully paid and requires reconciliation.",
            });

          default:
            throw error;
        }
      }
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
| Get school fee payments
|--------------------------------------------------------------------------
*/

export const getSchoolFeePayments =
  async (req, res) => {
    try {
      const schoolId =
        getSchoolId(req);

      if (!schoolId) {
        return res.status(400).json({
          message:
            "User is not associated with a school.",
        });
      }

      const {
        status,
        studentFeeAccountId,
        paymentMethod,
        page = 1,
        limit = 20,
      } = req.query;

      const pageNumber =
        Math.max(
          1,
          Number(page) || 1
        );

      const limitNumber =
        Math.min(
          100,
          Math.max(
            1,
            Number(limit) || 20
          )
        );

      const filter = {
        school:
          schoolId,

        type:
          "school_fees",
      };

      if (
        status &&
        [
          "pending",
          "successful",
          "failed",
          "cancelled",
        ].includes(status)
      ) {
        filter.status =
          status;
      }

      if (
        studentFeeAccountId
      ) {
        if (
          !isValidObjectId(
            studentFeeAccountId
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid student fee account ID.",
          });
        }

        filter.studentFeeAccount =
          studentFeeAccountId;
      }

      if (
        paymentMethod &&
        [
          "paystack",
          "cash",
          "bank_transfer",
          "pos",
          "other",
        ].includes(paymentMethod)
      ) {
        filter.paymentMethod =
          paymentMethod;
      }

      const skip =
        (pageNumber - 1) *
        limitNumber;

      const [
        payments,
        total,
      ] = await Promise.all([
        Payment.find(filter)
          .populate({
            path:
              "studentFeeAccount",

            populate: {
              path:
                "student",

              select:
                "firstName lastName admissionNumber",
            },
          })
          .sort({
            createdAt:
              -1,
          })
          .skip(skip)
          .limit(limitNumber),

        Payment.countDocuments(
          filter
        ),
      ]);

      return res.status(200).json({
        payments,

        pagination: {
          page:
            pageNumber,

          limit:
            limitNumber,

          total,

          pages:
            Math.ceil(
              total /
                limitNumber
            ),
        },
      });
    } catch (error) {
      console.error(
        "Get school fee payments error:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to fetch school fee payments.",
      });
    }
  };

/*
|--------------------------------------------------------------------------
| Get individual school fee payment
|--------------------------------------------------------------------------
*/

export const getSchoolFeePaymentById =
  async (req, res) => {
    try {
      const schoolId =
        getSchoolId(req);

      const {
        id,
      } = req.params;

      if (!schoolId) {
        return res.status(400).json({
          message:
            "User is not associated with a school.",
        });
      }

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          message:
            "Invalid payment ID.",
        });
      }

      const payment =
        await Payment.findOne({
          _id:
            id,

          school:
            schoolId,

          type:
            "school_fees",
        })
          .populate({
            path:
              "studentFeeAccount",

            populate: [
              {
                path:
                  "student",

                select:
                  "firstName lastName admissionNumber",
              },

              {
                path:
                  "feeStructure",
              },

              {
                path:
                  "academicSession",
              },

              {
                path:
                  "academicTerm",
              },
            ],
          })
          .populate(
            "academicSession"
          )
          .populate(
            "academicTerm"
          );

      if (!payment) {
        return res.status(404).json({
          message:
            "School fee payment not found.",
        });
      }

      return res.status(200).json({
        payment,
      });
    } catch (error) {
      console.error(
        "Get school fee payment error:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to fetch school fee payment.",
      });
    }
  };

/*
|--------------------------------------------------------------------------
| Record offline school fee payment
|--------------------------------------------------------------------------
|
| Offline payments are immediately successful because the school admin
| is recording a payment that has already been received.
|
| No subscription is involved.
|--------------------------------------------------------------------------
*/

export const recordOfflineSchoolFeePayment =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    try {
      let result;

      await session.withTransaction(
        async () => {
          const schoolId =
            getSchoolId(req);

          const {
            studentFeeAccountId,
            amount,
            paymentMethod,
            note,
          } = req.body;

          if (!schoolId) {
            throw new Error(
              "SCHOOL_NOT_FOUND"
            );
          }

          if (
            !studentFeeAccountId ||
            !isValidObjectId(
              studentFeeAccountId
            )
          ) {
            throw new Error(
              "INVALID_FEE_ACCOUNT"
            );
          }

          const paymentAmount =
            Number(amount);

          if (
            !Number.isFinite(
              paymentAmount
            ) ||
            paymentAmount <= 0
          ) {
            throw new Error(
              "INVALID_AMOUNT"
            );
          }

          const allowedMethods = [
            "cash",
            "bank_transfer",
            "pos",
            "other",
          ];

          if (
            !allowedMethods.includes(
              paymentMethod
            )
          ) {
            throw new Error(
              "INVALID_PAYMENT_METHOD"
            );
          }

          const feeAccount =
            await StudentFeeAccount.findOne(
              {
                _id:
                  studentFeeAccountId,

                school:
                  schoolId,

                isActive:
                  true,
              }
            ).session(session);

          if (!feeAccount) {
            throw new Error(
              "FEE_ACCOUNT_NOT_FOUND"
            );
          }

          const outstandingBalance =
            Number(
              feeAccount.totalAmountDue
            ) -
            Number(
              feeAccount.amountPaid
            );

          if (
            outstandingBalance <= 0
          ) {
            throw new Error(
              "FEE_ACCOUNT_ALREADY_PAID"
            );
          }

          if (
            paymentAmount >
            outstandingBalance
          ) {
            throw new Error(
              "PAYMENT_EXCEEDS_BALANCE"
            );
          }

          const paymentReference =
            generatePaymentReference(
              "OFFLINE-FEES"
            );

          const newAmountPaid =
            Number(
              feeAccount.amountPaid
            ) +
            paymentAmount;

          const newBalance =
            Math.max(
              0,
              Number(
                feeAccount.totalAmountDue
              ) -
                newAmountPaid
            );

          feeAccount.amountPaid =
            newAmountPaid;

          feeAccount.balance =
            newBalance;

          feeAccount.status =
            newBalance === 0
              ? "paid"
              : "partial";

          await feeAccount.save({
            session,
          });

          const [
            payment,
          ] = await Payment.create(
            [
              {
                school:
                  schoolId,

                subscription:
                  null,

                studentFeeAccount:
                  feeAccount._id,

                academicSession:
                  feeAccount.academicSession,

                academicTerm:
                  feeAccount.academicTerm,

                type:
                  "school_fees",

                amount:
                  paymentAmount,

                studentSeatsPurchased:
                  null,

                paymentReference,

                provider:
                  "offline",

                paymentMethod,

                status:
                  "successful",

                paidAt:
                  new Date(),

                metadata: {
                  recordedBy:
                    req.user?._id ||
                    null,

                  note:
                    note?.trim() ||
                    null,

                  offlinePayment:
                    true,
                },
              },
            ],
            {
              session,
            }
          );

          result = {
            payment,
            feeAccount,
          };
        }
      );

      return res.status(201).json({
        message:
          "Offline school fee payment recorded successfully.",

        payment:
          result.payment,

        studentFeeAccount:
          result.feeAccount,
      });
    } catch (error) {
      console.error(
        "Record offline school fee payment error:",
        error
      );

      switch (error.message) {
        case "SCHOOL_NOT_FOUND":
          return res.status(400).json({
            message:
              "User is not associated with a school.",
          });

        case "INVALID_FEE_ACCOUNT":
          return res.status(400).json({
            message:
              "A valid student fee account ID is required.",
          });

        case "INVALID_AMOUNT":
          return res.status(400).json({
            message:
              "Payment amount must be greater than zero.",
          });

        case "INVALID_PAYMENT_METHOD":
          return res.status(400).json({
            message:
              "Invalid offline payment method.",
          });

        case "FEE_ACCOUNT_NOT_FOUND":
          return res.status(404).json({
            message:
              "Student fee account not found.",
          });

        case "FEE_ACCOUNT_ALREADY_PAID":
          return res.status(400).json({
            message:
              "This student's fees have already been fully paid.",
          });

        case "PAYMENT_EXCEEDS_BALANCE":
          return res.status(400).json({
            message:
              "Payment amount exceeds the student's outstanding balance.",
          });

        default:
          return res.status(500).json({
            message:
              "Failed to record offline school fee payment.",
          });
      }
    } finally {
      await session.endSession();
    }
  };

/*
|--------------------------------------------------------------------------
| Update offline school fee payment
|--------------------------------------------------------------------------
|
| Only offline school-fee payments can be edited.
|
| When the amount changes, the StudentFeeAccount is adjusted by:
|
| newAmount - oldAmount
|
|--------------------------------------------------------------------------
*/

export const updateOfflineSchoolFeePayment =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    try {
      let result;

      await session.withTransaction(
        async () => {
          const schoolId =
            getSchoolId(req);

          const {
            id,
          } = req.params;

          const {
            amount,
            paymentMethod,
            note,
          } = req.body;

          if (!schoolId) {
            throw new Error(
              "SCHOOL_NOT_FOUND"
            );
          }

          if (!isValidObjectId(id)) {
            throw new Error(
              "INVALID_PAYMENT_ID"
            );
          }

          const payment =
            await Payment.findOne({
              _id:
                id,

              school:
                schoolId,

              type:
                "school_fees",

              provider:
                "offline",
            }).session(session);

          if (!payment) {
            throw new Error(
              "PAYMENT_NOT_FOUND"
            );
          }

          const newAmount =
            Number(amount);

          if (
            !Number.isFinite(
              newAmount
            ) ||
            newAmount <= 0
          ) {
            throw new Error(
              "INVALID_AMOUNT"
            );
          }

          const allowedMethods = [
            "cash",
            "bank_transfer",
            "pos",
            "other",
          ];

          if (
            !allowedMethods.includes(
              paymentMethod
            )
          ) {
            throw new Error(
              "INVALID_PAYMENT_METHOD"
            );
          }

          const feeAccount =
            await StudentFeeAccount.findOne(
              {
                _id:
                  payment.studentFeeAccount,

                school:
                  schoolId,

                isActive:
                  true,
              }
            ).session(session);

          if (!feeAccount) {
            throw new Error(
              "FEE_ACCOUNT_NOT_FOUND"
            );
          }

          /*
          |----------------------------------------------------------------------
          | Remove the old payment from the account first.
          |----------------------------------------------------------------------
          */

          const amountPaidWithoutPayment =
            Number(
              feeAccount.amountPaid
            ) -
            Number(
              payment.amount
            );

          if (
            amountPaidWithoutPayment <
            0
          ) {
            throw new Error(
              "PAYMENT_RECONCILIATION_ERROR"
            );
          }

          const newAmountPaid =
            amountPaidWithoutPayment +
            newAmount;

          const totalDue =
            Number(
              feeAccount.totalAmountDue
            );

          if (
            newAmountPaid >
            totalDue
          ) {
            throw new Error(
              "PAYMENT_EXCEEDS_BALANCE"
            );
          }

          const newBalance =
            Math.max(
              0,
              totalDue -
                newAmountPaid
            );

          feeAccount.amountPaid =
            newAmountPaid;

          feeAccount.balance =
            newBalance;

          feeAccount.status =
            newBalance === 0
              ? "paid"
              : newAmountPaid > 0
              ? "partial"
              : "unpaid";

          await feeAccount.save({
            session,
          });

          payment.amount =
            newAmount;

          payment.paymentMethod =
            paymentMethod;

          payment.metadata = {
            ...(payment.metadata ||
              {}),

            note:
              note?.trim() ||
              null,

            lastUpdatedBy:
              req.user?._id ||
              null,

            lastUpdatedAt:
              new Date(),
          };

          await payment.save({
            session,
          });

          result = {
            payment,
            feeAccount,
          };
        }
      );

      return res.status(200).json({
        message:
          "Offline school fee payment updated successfully.",

        payment:
          result.payment,

        studentFeeAccount:
          result.feeAccount,
      });
    } catch (error) {
      console.error(
        "Update offline school fee payment error:",
        error
      );

      switch (error.message) {
        case "SCHOOL_NOT_FOUND":
          return res.status(400).json({
            message:
              "User is not associated with a school.",
          });

        case "INVALID_PAYMENT_ID":
          return res.status(400).json({
            message:
              "Invalid payment ID.",
          });

        case "PAYMENT_NOT_FOUND":
          return res.status(404).json({
            message:
              "Offline school fee payment not found.",
          });

        case "INVALID_AMOUNT":
          return res.status(400).json({
            message:
              "Payment amount must be greater than zero.",
          });

        case "INVALID_PAYMENT_METHOD":
          return res.status(400).json({
            message:
              "Invalid offline payment method.",
          });

        case "FEE_ACCOUNT_NOT_FOUND":
          return res.status(404).json({
            message:
              "Student fee account not found.",
          });

        case "PAYMENT_EXCEEDS_BALANCE":
          return res.status(400).json({
            message:
              "Updated payment amount exceeds the student's total fees.",
          });

        case "PAYMENT_RECONCILIATION_ERROR":
          return res.status(409).json({
            message:
              "This payment cannot be safely updated because the fee account requires reconciliation.",
          });

        default:
          return res.status(500).json({
            message:
              "Failed to update offline school fee payment.",
          });
      }
    } finally {
      await session.endSession();
    }
  };

/*
|--------------------------------------------------------------------------
| Paystack webhook
|--------------------------------------------------------------------------
*/

export const handlePaystackWebhook =
  async (req, res) => {
    try {
      const signature =
        req.headers[
          "x-paystack-signature"
        ];

      if (!signature) {
        return res.status(400).json({
          message:
            "Paystack signature is missing.",
        });
      }

      if (
        !process.env
          .PAYSTACK_SECRET_KEY
      ) {
        console.error(
          "PAYSTACK_SECRET_KEY is not configured."
        );

        return res.status(500).json({
          message:
            "Payment configuration error.",
        });
      }

      if (
        !Buffer.isBuffer(
          req.body
        )
      ) {
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
            process.env
              .PAYSTACK_SECRET_KEY
          )
          .update(req.body)
          .digest("hex");

      const received =
        Buffer.from(
          signature,
          "utf8"
        );

      const expected =
        Buffer.from(
          expectedSignature,
          "utf8"
        );

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
          req.body.toString(
            "utf8"
          )
        );
      } catch {
        return res.status(400).json({
          message:
            "Invalid webhook payload.",
        });
      }

      console.log(
        "Paystack webhook received:",
        event.event
      );

      if (
        event.event !==
        "charge.success"
      ) {
        return res.status(200).json({
          message:
            "Webhook received.",
        });
      }

      const transaction =
        event.data;

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

      if (
        payment.status ===
        "successful"
      ) {
        return res.status(200).json({
          message:
            "Payment already processed.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | School fees
      |--------------------------------------------------------------------------
      */

      if (
        payment.type ===
        "school_fees"
      ) {
        try {
          const result =
            await processSuccessfulSchoolFeePayment(
              {
                paymentId:
                  payment._id,

                transaction,
              }
            );

          return res.status(200).json({
            message:
              result.alreadyProcessed
                ? "Payment already processed."
                : "School fee payment processed successfully.",
          });
        } catch (error) {
          switch (error.message) {
            case "PAYMENT_AMOUNT_MISMATCH":
              return res.status(400).json({
                message:
                  "Payment amount does not match.",
              });

            case "PAYMENT_REFERENCE_MISMATCH":
              return res.status(400).json({
                message:
                  "Payment reference mismatch.",
              });

            case "PAYMENT_CURRENCY_MISMATCH":
              return res.status(400).json({
                message:
                  "Invalid payment currency.",
              });

            case "PAYMENT_NOT_SUCCESSFUL":
            case "PAYMENT_ABANDONED":
              return res.status(200).json({
                message:
                  "Unsuccessful payment webhook processed.",
              });

            case "PAYMENT_EXCEEDS_BALANCE":
              return res.status(400).json({
                message:
                  "Payment amount exceeds the student's current outstanding balance.",
              });

            case "FEE_ACCOUNT_ALREADY_PAID":
              console.error(
                `Reconciliation required for payment ${payment.paymentReference}.`
              );

              return res.status(200).json({
                message:
                  "Payment received but requires reconciliation.",
              });

            case "FEE_ACCOUNT_NOT_FOUND":
              return res.status(500).json({
                message:
                  "Associated student fee account not found.",
              });

            default:
              throw error;
          }
        }
      }

      /*
      |--------------------------------------------------------------------------
      | Subscription payments
      |--------------------------------------------------------------------------
      */

      if (
        payment.type ===
          "initial_subscription" ||
        payment.type ===
          "additional_seats"
      ) {
        try {
          const result =
            await processSuccessfulSubscriptionPayment(
              {
                paymentId:
                  payment._id,

                transaction,
              }
            );

          return res.status(200).json({
            message:
              result.alreadyProcessed
                ? "Payment already processed."
                : "Subscription payment processed successfully.",
          });
        } catch (error) {
          switch (error.message) {
            case "PAYMENT_AMOUNT_MISMATCH":
              return res.status(400).json({
                message:
                  "Payment amount does not match.",
              });

            case "PAYMENT_REFERENCE_MISMATCH":
              return res.status(400).json({
                message:
                  "Payment reference mismatch.",
              });

            case "PAYMENT_CURRENCY_MISMATCH":
              return res.status(400).json({
                message:
                  "Invalid payment currency.",
              });

            case "PAYMENT_NOT_SUCCESSFUL":
            case "PAYMENT_ABANDONED":
              return res.status(200).json({
                message:
                  "Unsuccessful payment webhook processed.",
              });

            case "SUBSCRIPTION_NOT_FOUND":
              return res.status(500).json({
                message:
                  "Associated subscription not found.",
              });

            case "SUBSCRIPTION_ALREADY_EXISTS":
              console.error(
                `Subscription payment ${payment.paymentReference} requires reconciliation because a subscription already exists.`
              );

              return res.status(200).json({
                message:
                  "Payment received but requires reconciliation.",
              });

            case "ACADEMIC_SESSION_NOT_FOUND":
              return res.status(500).json({
                message:
                  "Academic session associated with the payment was not found.",
              });

            case "ACADEMIC_TERM_NOT_FOUND":
              return res.status(500).json({
                message:
                  "Academic term associated with the payment was not found.",
              });

            case "INVALID_STUDENT_SEAT_QUANTITY":
              return res.status(400).json({
                message:
                  "Invalid student seat quantity.",
              });

            case "INVALID_ADDITIONAL_SEAT_QUANTITY":
              return res.status(400).json({
                message:
                  "Invalid additional seat quantity.",
              });

            default:
              throw error;
          }
        }
      }

      return res.status(200).json({
        message:
          "Webhook acknowledged. Unsupported payment type.",
      });
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