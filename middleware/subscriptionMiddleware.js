import AcademicTerm from "../models/AcademicTerm.js";
import Subscription from "../models/Subscription.js";

export const requireActiveSubscription = async (req, res, next) => {
  try {
    const schoolId = req.user?.school;

    if (!schoolId) {
      return res.status(403).json({
        message: "User is not associated with a school.",
      });
    }

    // Find the school's current academic term
    const currentTerm = await AcademicTerm.findOne({
      school: schoolId,
      isCurrent: true,
      isActive: true,
    });

    if (!currentTerm) {
      return res.status(403).json({
        message:
          "No active academic term is currently configured for this school.",
      });
    }

    // Find the subscription for the current term
    const subscription = await Subscription.findOne({
      school: schoolId,
      academicSession: currentTerm.academicSession,
      academicTerm: currentTerm._id,
      status: "active",
    });

    if (!subscription) {
      return res.status(403).json({
        message:
          "An active subscription is required to perform this action.",
      });
    }

    // Check expiration
    if (
      subscription.expiresAt &&
      new Date(subscription.expiresAt) < new Date()
    ) {
      return res.status(403).json({
        message:
          "Your subscription for the current academic term has expired. Please renew your subscription.",
      });
    }

    // Attach subscription information to the request
    req.subscription = subscription;
    req.currentAcademicTerm = currentTerm;

    next();
  } catch (error) {
    console.error("Subscription middleware error:", error);

    return res.status(500).json({
      message: "Failed to verify subscription status.",
    });
  }
};