import mongoose from "mongoose";

import Subscription from "../models/Subscription.js";
import Student from "../models/Student.js";
import AcademicSession from "../models/AcademicSession.js";
import AcademicTerm from "../models/AcademicTerm.js";

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
      amount,
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

    if (amount === undefined || amount < 0) {
      return res.status(400).json({
        message: "A valid subscription amount is required.",
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

    // Verify session belongs to this school
    const academicSession = await AcademicSession.findOne({
      _id: academicSessionId,
      school: schoolId,
    });

    if (!academicSession) {
      return res.status(404).json({
        message: "Academic session not found for this school.",
      });
    }

    // Verify term belongs to this school and session
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

    // Prevent duplicate subscription
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

    const subscription = await Subscription.create({
      school: schoolId,
      academicSession: academicSessionId,
      academicTerm: academicTermId,
      studentLimit,
      amount,
      status: "pending",
      startsAt: academicTerm.startDate,
      expiresAt: academicTerm.endDate,
    });

    return res.status(201).json({
      message: "Subscription created successfully.",
      subscription,
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
// Temporary activation endpoint for testing
// Paystack will replace this later
// --------------------------------------------------
export const activateSubscription = async (req, res) => {
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

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      school: schoolId,
    });

    if (!subscription) {
      return res.status(404).json({
        message: "Subscription not found.",
      });
    }

    subscription.status = "active";
    subscription.activatedAt = new Date();

    await subscription.save();

    return res.status(200).json({
      message: "Subscription activated successfully.",
      subscription,
    });
  } catch (error) {
    console.error("Activate subscription error:", error);

    return res.status(500).json({
      message: "Failed to activate subscription.",
      error: error.message,
    });
  }
};

// --------------------------------------------------
// Add additional student seats
// --------------------------------------------------
export const addStudentSeats = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const { subscriptionId, additionalSeats, amount } = req.body;

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

    if (!additionalSeats || additionalSeats < 1) {
      return res.status(400).json({
        message: "Additional seats must be at least 1.",
      });
    }

    if (amount === undefined || amount < 0) {
      return res.status(400).json({
        message: "A valid amount is required.",
      });
    }

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
      });
    }

    subscription.studentLimit += Number(additionalSeats);

    subscription.amount += Number(amount);

    await subscription.save();

    return res.status(200).json({
      message: "Additional student seats added successfully.",
      subscription,
    });
  } catch (error) {
    console.error("Add student seats error:", error);

    return res.status(500).json({
      message: "Failed to add additional student seats.",
      error: error.message,
    });
  }
};