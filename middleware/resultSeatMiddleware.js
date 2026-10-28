import mongoose from "mongoose";
import Student from "../models/Student.js";
import Result from "../models/Result.js";

const getSchoolId = (req) =>
  req.user?.school?._id || req.user?.school;

export const requireStudentSeatForResult = async (req, res, next) => {
  try {
    const schoolId = getSchoolId(req);
    const studentLimit = Number(req.subscription?.studentLimit);

    if (!schoolId) {
      return res.status(403).json({
        message: "User is not associated with a school.",
      });
    }

    if (!Number.isSafeInteger(studentLimit) || studentLimit < 0) {
      return res.status(403).json({
        message: "A valid student-seat allowance could not be verified.",
      });
    }

    // Seat coverage is explicit and term-specific. Never infer eligibility
    // from student creation order: the school administrator chooses it.
    const allocatedIds = Array.isArray(req.subscription?.allocatedStudents)
      ? req.subscription.allocatedStudents
      : [];

    const eligibleStudents = allocatedIds.length
      ? await Student.find({
          _id: { $in: allocatedIds },
          school: schoolId,
          isActive: true,
        })
          .select("_id")
          .lean()
      : [];

    const eligibleStudentIds = new Set(
      eligibleStudents.map((student) => student._id.toString())
    );

    let targetStudentIds = [];

    if (req.body?.student) {
      targetStudentIds.push(req.body.student);
    }

    if (Array.isArray(req.body?.results)) {
      const resultsWithScores = req.body.results.filter((item) => {
        const hasAssessmentScore =
          Array.isArray(item?.assessmentScores) &&
          item.assessmentScores.some(
            (assessment) =>
              assessment?.score !== "" &&
              assessment?.score !== null &&
              assessment?.score !== undefined
          );

        const hasExamScore =
          item?.examScore !== "" &&
          item?.examScore !== null &&
          item?.examScore !== undefined;

        return hasAssessmentScore || hasExamScore;
      });

      targetStudentIds.push(
        ...resultsWithScores
          .map((item) => item?.student)
          .filter(Boolean)
      );
    }

    if (req.params?.id && mongoose.isValidObjectId(req.params.id)) {
      const result = await Result.findOne({
        _id: req.params.id,
        school: schoolId,
      })
        .select("student")
        .lean();

      if (result?.student) {
        targetStudentIds.push(result.student);
      }
    }

    targetStudentIds = [
      ...new Set(targetStudentIds.map((id) => id.toString())),
    ];

    const ineligibleStudentIds = targetStudentIds.filter(
      (id) => !eligibleStudentIds.has(id)
    );

    if (ineligibleStudentIds.length > 0) {
      return res.status(403).json({
        message:
          "This student does not currently have a seat assigned from the school's purchased allowance. Ask the school administrator to assign a seat or increase the subscription.",
        code: "STUDENT_SEAT_NOT_ALLOCATED",
        studentLimit,
        allocatedSeats: eligibleStudentIds.size,
        blockedStudentIds: ineligibleStudentIds,
      });
    }

    req.eligibleStudentIds = eligibleStudents.map((student) => student._id);
    return next();
  } catch (error) {
    console.error("Result seat-limit middleware error:", error.message);

    return res.status(500).json({
      message: "Failed to verify student-seat eligibility.",
    });
  }
};
