import mongoose from "mongoose";
import Student from "../models/Student.js";

// GET /api/students/seat-allocation
export const getStudentSeatAllocation = async (req, res) => {
  try {
    const schoolId = req.user?.school?._id || req.user?.school;
    const subscription = req.subscription;

    const students = await Student.find({
      school: schoolId,
      isActive: true,
    })
      .select("_id studentId firstName middleName lastName schoolClass isActive")
      .populate("schoolClass", "name arm section")
      .sort({ lastName: 1, firstName: 1, studentId: 1 })
      .lean();

    const activeIds = new Set(students.map((student) => student._id.toString()));
    const allocatedStudentIds = (subscription.allocatedStudents || [])
      .map((id) => id.toString())
      .filter((id) => activeIds.has(id));

    return res.json({
      studentLimit: Number(subscription.studentLimit) || 0,
      allocatedStudentIds,
      allocatedSeats: allocatedStudentIds.length,
      availableSeats: Math.max(
        0,
        (Number(subscription.studentLimit) || 0) - allocatedStudentIds.length
      ),
      academicSession: subscription.academicSession,
      academicTerm: subscription.academicTerm,
      students,
    });
  } catch (error) {
    console.error("Get student seat allocation error:", error.message);
    return res.status(500).json({
      message: "Unable to load student seat allocation.",
    });
  }
};

// PUT /api/students/seat-allocation
export const updateStudentSeatAllocation = async (req, res) => {
  try {
    const schoolId = req.user?.school?._id || req.user?.school;
    const subscription = req.subscription;
    const { studentIds } = req.body || {};

    if (!Array.isArray(studentIds)) {
      return res.status(400).json({
        message: "Please submit the list of students to assign seats to.",
      });
    }

    const normalizedIds = [...new Set(studentIds.map((id) => String(id)))];

    if (normalizedIds.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({
        message: "The selected student list contains an invalid student ID.",
      });
    }

    const studentLimit = Number(subscription.studentLimit) || 0;

    if (normalizedIds.length > studentLimit) {
      return res.status(400).json({
        message: `You have ${studentLimit} purchased seat(s). Select no more than ${studentLimit} student(s).`,
        code: "STUDENT_SEAT_LIMIT_EXCEEDED",
        studentLimit,
        selectedCount: normalizedIds.length,
      });
    }

    const students = normalizedIds.length
      ? await Student.find({
          _id: { $in: normalizedIds },
          school: schoolId,
          isActive: true,
        })
          .select("_id")
          .lean()
      : [];

    if (students.length !== normalizedIds.length) {
      return res.status(400).json({
        message:
          "One or more selected students are inactive or do not belong to this school. Refresh the page and try again.",
      });
    }

    subscription.allocatedStudents = students.map((student) => student._id);
    await subscription.save();

    return res.json({
      message: "Student seat assignments saved successfully.",
      studentLimit,
      allocatedStudentIds: students.map((student) => student._id.toString()),
      allocatedSeats: students.length,
      availableSeats: Math.max(0, studentLimit - students.length),
    });
  } catch (error) {
    console.error("Update student seat allocation error:", error.message);
    return res.status(500).json({
      message: "Unable to save student seat assignments.",
    });
  }
};
