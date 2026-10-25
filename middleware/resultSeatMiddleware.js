
import mongoose from "mongoose";
import Student from "../models/Student.js";
import Result from "../models/Result.js";

const getSchoolId = (req) =>
  req.user?.school?._id || req.user?.school;

export const requireStudentSeatForResult = async (
  req,
  res,
  next
) => {
  try {
    const schoolId = getSchoolId(req);
    const studentLimit = Number(req.subscription?.studentLimit);

    if (!schoolId) {
      return res.status(403).json({
        message: "User is not associated with a school.",
      });
    }

    if (
      !Number.isSafeInteger(studentLimit) ||
      studentLimit < 0
    ) {
      return res.status(403).json({
        message:
          "A valid student-seat allowance could not be verified.",
      });
    }

    // Select the students occupying the purchased seats.
    // Older active student records retain their seats first.
    const eligibleStudents = await Student.find({
      school: schoolId,
      isActive: true,
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(studentLimit)
      .select("_id")
      .lean();

    const eligibleStudentIds = new Set(
      eligibleStudents.map((student) =>
        student._id.toString()
      )
    );

    let targetStudentIds = [];

    // Single-result creation.
    if (req.body?.student) {
      targetStudentIds.push(req.body.student);
    }

    // Bulk result entry.
    if (Array.isArray(req.body?.results)) {
      targetStudentIds.push(
        ...req.body.results
          .map((item) => item?.student)
          .filter(Boolean)
      );
    }

    // Updating, submitting, publishing, rejecting or locking
    // an existing result.
    if (
      req.params?.id &&
      mongoose.isValidObjectId(req.params.id)
    ) {
      const result = await Result.findOne({
        _id: req.params.id,
        school: schoolId,
      })
        .select("student")
        .lean();

      // Let the controller handle the normal not-found response.
      if (result?.student) {
        targetStudentIds.push(result.student);
      }
    }

    // Remove duplicate IDs before checking.
    targetStudentIds = [
      ...new Set(
        targetStudentIds.map((id) => id.toString())
      ),
    ];

    const ineligibleStudentIds = targetStudentIds.filter(
      (id) => !eligibleStudentIds.has(id)
    );

    if (ineligibleStudentIds.length > 0) {
      return res.status(403).json({
        message:
          "Results cannot be entered or modified for students outside the school's purchased seat allowance. Upgrade the subscription or deactivate students who no longer require a seat.",
        code: "STUDENT_SEAT_LIMIT_EXCEEDED",
        studentLimit,
        blockedStudentIds: ineligibleStudentIds,
      });
    }

    req.eligibleStudentIds = eligibleStudents.map(
      (student) => student._id
    );

    return next();
  } catch (error) {
    console.error(
      "Result seat-limit middleware error:",
      error.message
    );

    return res.status(500).json({
      message: "Failed to verify student-seat eligibility.",
    });
  }
};
