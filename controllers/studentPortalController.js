import Student from "../models/Student.js";
import Assignment from "../models/Assignment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import Attendance from "../models/Attendance.js";
import AcademicTerm from "../models/AcademicTerm.js";

export const getStudentDashboard = async (req, res) => {
  try {
    // Only students can access the student portal dashboard.
    if (req.user.role !== "student") {
      return res.status(403).json({
        message: "Only students can access the student portal.",
      });
    }

    /*
     * Find the student record linked to the logged-in user.
     *
     * We explicitly include the user's school to enforce
     * school-level isolation.
     */
    const student = await Student.findOne({
      user: req.user._id,
      school: req.user.school,
      isActive: true,
    })
      .populate("school", "name address phone email")
      .populate("schoolClass", "name arm section")
      .populate("academicSession", "name startDate endDate")
      .populate("parent", "firstName lastName email phone");

    if (!student) {
      return res.status(404).json({
        message: "Student record not found.",
      });
    }

    /*
     * Validate required academic references.
     */
    if (
      !student.school ||
      !student.schoolClass ||
      !student.academicSession
    ) {
      return res.status(409).json({
        message:
          "Student academic information is incomplete. Please contact the school administrator.",
      });
    }

    /*
     * Get the current active academic term for the student's school
     * and academic session.
     */
    const currentTerm = await AcademicTerm.findOne({
      school: student.school._id,
      academicSession: student.academicSession._id,
      isCurrent: true,
      isActive: true,
    }).select("_id name startDate endDate");

    /*
     * If there is no current term, the dashboard can still return
     * the student's basic profile, but academic dashboard data should
     * remain empty rather than querying unrelated terms.
     */
    let assignments = [];
    let attendanceRecords = [];

    if (currentTerm) {
      /*
       * Get published assignments for this student's:
       * - school
       * - academic session
       * - current term
       * - class
       */
      assignments = await Assignment.find({
        school: student.school._id,
        academicSession: student.academicSession._id,
        term: currentTerm._id,
        schoolClass: student.schoolClass._id,
        status: "published",
      })
        .populate("term", "name startDate endDate")
        .populate("subject", "name code")
        .populate("teacher", "firstName lastName")
        .sort({ dueDate: 1, createdAt: -1 });

      /*
       * Get this student's attendance records for the
       * current academic term.
       */
      attendanceRecords = await Attendance.find({
        school: student.school._id,
        academicSession: student.academicSession._id,
        term: currentTerm._id,
        class: student.schoolClass._id,
        student: student._id,
      })
        .populate("term", "name startDate endDate")
        .sort({ date: -1 });
    }

    /*
     * Get this student's assignment submissions.
     */
    const assignmentIds = assignments.map(
      (assignment) => assignment._id
    );

    const submissions =
      assignmentIds.length > 0
        ? await AssignmentSubmission.find({
            assignment: { $in: assignmentIds },
            student: student._id,
            school: student.school._id,
          }).select(
            "assignment submittedAt score feedback status attachments content"
          )
        : [];

    const submissionMap = new Map();

    submissions.forEach((submission) => {
      submissionMap.set(
        submission.assignment.toString(),
        submission
      );
    });

    /*
     * Add submission information to assignments.
     */
    const assignmentsWithSubmission = assignments.map(
      (assignment) => {
        const submission = submissionMap.get(
          assignment._id.toString()
        );

        return {
          ...assignment.toObject(),

          submission: submission
            ? {
                _id: submission._id,
                submittedAt: submission.submittedAt,
                score: submission.score,
                feedback: submission.feedback,
                status: submission.status,
              }
            : null,

          submissionStatus: submission
            ? submission.status
            : "not_submitted",
        };
      }
    );

    /*
     * Assignment statistics.
     */
    const totalAssignments = assignmentsWithSubmission.length;

    const submittedAssignments =
      assignmentsWithSubmission.filter(
        (assignment) =>
          assignment.submissionStatus !== "not_submitted"
      ).length;

    const gradedAssignments =
      assignmentsWithSubmission.filter(
        (assignment) =>
          assignment.submissionStatus === "graded" ||
          assignment.submissionStatus === "returned"
      ).length;

    const pendingAssignments =
      assignmentsWithSubmission.filter(
        (assignment) =>
          assignment.submissionStatus === "not_submitted"
      ).length;

    /*
     * Attendance statistics.
     */
    const attendanceStats = {
      total: attendanceRecords.length,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };

    attendanceRecords.forEach((record) => {
      if (record.status === "present") {
        attendanceStats.present += 1;
      }

      if (record.status === "absent") {
        attendanceStats.absent += 1;
      }

      if (record.status === "late") {
        attendanceStats.late += 1;
      }

      if (record.status === "excused") {
        attendanceStats.excused += 1;
      }
    });

    // Late counts as attendance.
    attendanceStats.attended =
      attendanceStats.present + attendanceStats.late;

    attendanceStats.percentage =
      attendanceStats.total > 0
        ? Number(
            (
              (attendanceStats.attended /
                attendanceStats.total) *
              100
            ).toFixed(2)
          )
        : 0;

    /*
     * Return student dashboard.
     */
    return res.status(200).json({
      student: {
        _id: student._id,
        studentId: student.studentId,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        dateOfBirth: student.dateOfBirth,
        gender: student.gender,
        admissionDate: student.admissionDate,
        phone: student.phone,
        address: student.address,
        profileImage: student.profileImage,
      },

      school: student.school,

      schoolClass: student.schoolClass,

      academicSession: student.academicSession,

      currentTerm: currentTerm || null,

      parent: student.parent,

      assignmentStats: {
        total: totalAssignments,
        pending: pendingAssignments,
        submitted: submittedAssignments,
        graded: gradedAssignments,
      },

      attendance: attendanceStats,

      recentAssignments:
        assignmentsWithSubmission.slice(0, 5),

      recentAttendance: attendanceRecords
        .slice(0, 5)
        .map((record) => ({
          _id: record._id,
          date: record.date,
          status: record.status,
          remarks: record.remarks,
          term: record.term,
        })),

      assignments: assignmentsWithSubmission,
    });
  } catch (error) {
    console.error("Get student dashboard error:", error);

    return res.status(500).json({
      message: "Server error while fetching student dashboard.",
    });
  }
};