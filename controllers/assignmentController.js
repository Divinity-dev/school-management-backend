import Assignment from "../models/Assignment.js";
import SubjectAssignment from "../models/SubjectAssignment.js";
import SchoolClass from "../models/SchoolClass.js";
import AcademicTerm from "../models/AcademicTerm.js";
import Student from "../models/Student.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";

export const createAssignment = async (req, res) => {
  try {
    const {
      subjectAssignmentId,
      term,
      title,
      description,
      instructions,
      dueDate,
      attachmentUrl,
      attachmentName,
    } = req.body;

    if (!subjectAssignmentId || !term || !title || !dueDate) {
      return res.status(400).json({
        message:
          "subjectAssignmentId, term, title and dueDate are required",
      });
    }

    // Only teachers and school admins can create assignments.
    if (
      req.user.role !== "teacher" &&
      req.user.role !== "schoolAdmin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        message: "You are not authorized to create assignments",
      });
    }

    const subjectAssignment = await SubjectAssignment.findById(
      subjectAssignmentId
    );

    if (!subjectAssignment) {
      return res.status(404).json({
        message: "Subject assignment not found",
      });
    }

    if (!subjectAssignment.isActive) {
      return res.status(400).json({
        message: "This subject assignment is inactive",
      });
    }

    // School isolation.
    if (
      req.user.role !== "superAdmin" &&
      subjectAssignment.school.toString() !== req.user.school.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to use this subject assignment",
      });
    }

    // Teachers can only create assignments for subjects they teach.
    if (
      req.user.role === "teacher" &&
      subjectAssignment.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message:
          "You are not authorized to create assignments for this subject",
      });
    }

    const schoolClass = await SchoolClass.findById(
      subjectAssignment.schoolClass
    );

    if (!schoolClass) {
      return res.status(404).json({
        message: "Class associated with this subject assignment not found",
      });
    }

    // Make sure the class belongs to the same school.
    if (
      schoolClass.school.toString() !==
      subjectAssignment.school.toString()
    ) {
      return res.status(400).json({
        message: "Subject assignment and class belong to different schools",
      });
    }

    // Make sure the subject assignment belongs to the class.
    if (
      subjectAssignment.schoolClass.toString() !==
      schoolClass._id.toString()
    ) {
      return res.status(400).json({
        message: "Invalid class for this subject assignment",
      });
    }

    const academicTerm = await AcademicTerm.findById(term);

    if (!academicTerm) {
      return res.status(404).json({
        message: "Academic term not found",
      });
    }

    // Term must belong to the same school.
    if (
      academicTerm.school.toString() !==
      subjectAssignment.school.toString()
    ) {
      return res.status(400).json({
        message: "Academic term does not belong to this school",
      });
    }

    // Term must belong to the same academic session.
    if (
      academicTerm.academicSession.toString() !==
      subjectAssignment.academicSession.toString()
    ) {
      return res.status(400).json({
        message:
          "Academic term does not belong to the subject assignment's academic session",
      });
    }

    // Class must belong to the same academic session.
    if (
      schoolClass.academicSession.toString() !==
      subjectAssignment.academicSession.toString()
    ) {
      return res.status(400).json({
        message:
          "Class does not belong to the subject assignment's academic session",
      });
    }

    const dueDateValue = new Date(dueDate);

    if (Number.isNaN(dueDateValue.getTime())) {
      return res.status(400).json({
        message: "Invalid due date",
      });
    }

    const assignment = await Assignment.create({
      school: subjectAssignment.school,
      academicSession: subjectAssignment.academicSession,
      term: academicTerm._id,
      schoolClass: subjectAssignment.schoolClass,
      subject: subjectAssignment.subject,
      subjectAssignment: subjectAssignment._id,
      teacher: subjectAssignment.teacher,
      title,
      description,
      instructions,
      dueDate: dueDateValue,
      attachmentUrl,
      attachmentName,
      status: "draft",
    });

    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate("academicSession", "name")
      .populate("term", "name startDate endDate")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate("teacher", "firstName lastName email")
      .populate("subjectAssignment");

    return res.status(201).json({
      message: "Assignment created successfully",
      assignment: populatedAssignment,
    });
  } catch (error) {
    console.error("Create assignment error:", error);

    return res.status(500).json({
      message: "Server error while creating assignment",
    });
  }
};

export const getTeacherAssignments = async (req, res) => {
  try {
    // Only teachers and school admins can access teacher assignments.
    if (
      req.user.role !== "teacher" &&
      req.user.role !== "schoolAdmin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        message: "You are not authorized to view teacher assignments",
      });
    }

    const assignments = await Assignment.find({
      teacher: req.user._id,
      ...(req.user.role !== "superAdmin"
        ? { school: req.user.school }
        : {}),
    })
      .populate("academicSession", "name")
      .populate("term", "name startDate endDate")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate("teacher", "firstName lastName email")
      .populate("subjectAssignment")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      count: assignments.length,
      assignments,
    });
  } catch (error) {
    console.error("Get teacher assignments error:", error);

    return res.status(500).json({
      message: "Server error while fetching teacher assignments",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get Student Assignments
|--------------------------------------------------------------------------
*/

export const getStudentAssignments = async (req, res) => {
  try {
    // Only students can access their assignment portal.
    if (req.user.role !== "student") {
      return res.status(403).json({
        message: "Only students can view student assignments",
      });
    }

    // Find the student record linked to the logged-in user.
    const student = await Student.findOne({
      user: req.user._id,
      isActive: true,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student record not found",
      });
    }

    /*
     * Only return published assignments for the student's:
     * - school
     * - academic session
     * - class
     */
    const assignments = await Assignment.find({
      school: student.school,
      academicSession: student.academicSession,
      schoolClass: student.schoolClass,
      status: "published",
    })
      .populate("academicSession", "name")
      .populate("term", "name startDate endDate")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate("teacher", "firstName lastName")
      .sort({ dueDate: 1, createdAt: -1 });

    /*
     * Find this student's submissions for all returned assignments.
     */
    const assignmentIds = assignments.map(
      (assignment) => assignment._id
    );

    const submissions = await AssignmentSubmission.find({
      assignment: { $in: assignmentIds },
      student: student._id,
      school: student.school,
    }).select(
      "assignment submittedAt score feedback status attachments content"
    );

    const submissionMap = new Map();

    submissions.forEach((submission) => {
      submissionMap.set(
        submission.assignment.toString(),
        submission
      );
    });

    /*
     * Add submission information to every assignment.
     */
    const assignmentsWithSubmission = assignments.map((assignment) => {
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
              attachments: submission.attachments,
              content: submission.content,
            }
          : null,

        submissionStatus: submission
          ? submission.status
          : "not_submitted",
      };
    });

    return res.status(200).json({
      count: assignmentsWithSubmission.length,
      assignments: assignmentsWithSubmission,
    });
  } catch (error) {
    console.error("Get student assignments error:", error);

    return res.status(500).json({
      message: "Server error while fetching student assignments",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get Student's Own Assignment Submission
|--------------------------------------------------------------------------
*/

export const getStudentAssignmentSubmission = async (req, res) => {
  try {
    // Only students can access their own submissions.
    if (req.user.role !== "student") {
      return res.status(403).json({
        message: "Only students can view their submissions",
      });
    }

    const { assignmentId } = req.params;

    if (!assignmentId) {
      return res.status(400).json({
        message: "assignmentId is required",
      });
    }

    // Find the student record linked to the logged-in user.
    const student = await Student.findOne({
      user: req.user._id,
      isActive: true,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student record not found",
      });
    }

    // Find the assignment.
    const assignment = await Assignment.findById(assignmentId)
      .populate("academicSession", "name")
      .populate("term", "name startDate endDate")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate("teacher", "firstName lastName");

    if (!assignment) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    // School isolation.
    if (
      assignment.school.toString() !== student.school.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this assignment",
      });
    }

    // Class isolation.
    if (
  assignment.schoolClass._id.toString() !==
  student.schoolClass.toString()
) {
      return res.status(403).json({
        message: "This assignment is not assigned to your class",
      });
    }

    // Academic session isolation.
    if (
      assignment.academicSession._id.toString() !==
      student.academicSession.toString()
    ) {
      return res.status(403).json({
        message:
          "This assignment does not belong to your academic session",
      });
    }

    // Find only this student's submission.
    const submission = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student: student._id,
      school: student.school,
    }).populate(
      "student",
      "studentId firstName middleName lastName profileImage"
    );

    if (!submission) {
      return res.status(404).json({
        message: "You have not submitted this assignment",
      });
    }

    return res.status(200).json({
      assignment,
      submission,
    });
  } catch (error) {
    console.error(
      "Get student assignment submission error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while fetching student assignment submission",
    });
  }
};

export const submitAssignment = async (req, res) => {
  try {
    // Only students can submit assignments.
    if (req.user.role !== "student") {
      return res.status(403).json({
        message: "Only students can submit assignments",
      });
    }

    // Find the student record belonging to the authenticated user.
    const student = await Student.findOne({
      user: req.user._id,
      isActive: true,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student record not found",
      });
    }

    const { assignmentId } = req.params;
    const { content, attachments } = req.body;

    if (!assignmentId) {
      return res.status(400).json({
        message: "assignmentId is required",
      });
    }

    // Find the assignment.
    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    // School isolation.
    if (
      assignment.school.toString() !== student.school.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to submit this assignment",
      });
    }

    // Make sure the assignment is for the student's class.
    if (
      assignment.schoolClass.toString() !==
      student.schoolClass.toString()
    ) {
      return res.status(403).json({
        message: "This assignment is not assigned to your class",
      });
    }

    // Make sure the assignment belongs to the student's academic session.
    if (
      assignment.academicSession.toString() !==
      student.academicSession.toString()
    ) {
      return res.status(403).json({
        message:
          "This assignment does not belong to your academic session",
      });
    }

    // Students can only submit published assignments.
    if (assignment.status !== "published") {
      return res.status(400).json({
        message: "This assignment is not currently accepting submissions",
      });
    }

    // Check the deadline.
    if (new Date() > new Date(assignment.dueDate)) {
      return res.status(400).json({
        message: "The submission deadline for this assignment has passed",
      });
    }

    // Prevent duplicate submissions.
    const existingSubmission =
      await AssignmentSubmission.findOne({
        assignment: assignment._id,
        student: student._id,
      });

    if (existingSubmission) {
      return res.status(409).json({
        message: "You have already submitted this assignment",
        submission: existingSubmission,
      });
    }

    // Validate content/attachments.
    const hasContent =
      typeof content === "string" && content.trim().length > 0;

    const hasAttachments =
      Array.isArray(attachments) && attachments.length > 0;

    if (!hasContent && !hasAttachments) {
      return res.status(400).json({
        message:
          "You must provide an answer or at least one attachment",
      });
    }

    const submission = await AssignmentSubmission.create({
      assignment: assignment._id,
      student: student._id,
      school: student.school,
      content: content?.trim() || "",
      attachments: hasAttachments ? attachments : [],
      submittedAt: new Date(),
      status: "submitted",
    });

    const populatedSubmission =
      await AssignmentSubmission.findById(submission._id)
        .populate(
          "assignment",
          "title description instructions dueDate"
        )
        .populate(
          "student",
          "studentId firstName middleName lastName"
        );

    return res.status(201).json({
      message: "Assignment submitted successfully",
      submission: populatedSubmission,
    });
  } catch (error) {
    console.error("Submit assignment error:", error);

    return res.status(500).json({
      message: "Server error while submitting assignment",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get Assignment Submissions
|--------------------------------------------------------------------------
*/

export const getAssignmentSubmissions = async (req, res) => {
  try {
    // Only teachers, school admins and super admins can view submissions.
    if (
      req.user.role !== "teacher" &&
      req.user.role !== "schoolAdmin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        message: "You are not authorized to view assignment submissions",
      });
    }

    const { assignmentId } = req.params;

    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    /*
     * Teachers can only access assignments they created/own.
     */
    if (
      req.user.role === "teacher" &&
      assignment.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message:
          "You are not authorized to view submissions for this assignment",
      });
    }

    /*
     * School admins can only access assignments belonging
     * to their school.
     */
    if (
      req.user.role === "schoolAdmin" &&
      assignment.school.toString() !== req.user.school.toString()
    ) {
      return res.status(403).json({
        message:
          "You are not authorized to view submissions for this assignment",
      });
    }

    const submissions = await AssignmentSubmission.find({
      assignment: assignment._id,
      school: assignment.school,
    })
      .populate(
        "student",
        "studentId firstName middleName lastName profileImage schoolClass"
      )
      .sort({ submittedAt: -1 });

    return res.status(200).json({
      count: submissions.length,
      assignment: {
        _id: assignment._id,
        title: assignment.title,
        description: assignment.description,
        instructions: assignment.instructions,
        dueDate: assignment.dueDate,
        status: assignment.status,
      },
      submissions,
    });
  } catch (error) {
    console.error("Get assignment submissions error:", error);

    return res.status(500).json({
      message: "Server error while fetching assignment submissions",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get Single Assignment Submission
|--------------------------------------------------------------------------
*/

export const getAssignmentSubmission = async (req, res) => {
  try {
    // Only teachers, school admins and super admins can view submissions.
    if (
      req.user.role !== "teacher" &&
      req.user.role !== "schoolAdmin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        message: "You are not authorized to view assignment submissions",
      });
    }

    const { assignmentId, submissionId } = req.params;

    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    // Teacher ownership check.
    if (
      req.user.role === "teacher" &&
      assignment.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message:
          "You are not authorized to view this assignment submission",
      });
    }

    // School isolation for school admins.
    if (
      req.user.role === "schoolAdmin" &&
      assignment.school.toString() !== req.user.school.toString()
    ) {
      return res.status(403).json({
        message:
          "You are not authorized to view this assignment submission",
      });
    }

    const submission = await AssignmentSubmission.findOne({
      _id: submissionId,
      assignment: assignment._id,
      school: assignment.school,
    })
      .populate(
        "student",
        "studentId firstName middleName lastName profileImage schoolClass academicSession"
      )
      .populate(
        "assignment",
        "title description instructions dueDate status"
      );

    if (!submission) {
      return res.status(404).json({
        message: "Assignment submission not found",
      });
    }

    return res.status(200).json({
      submission,
    });
  } catch (error) {
    console.error("Get assignment submission error:", error);

    return res.status(500).json({
      message: "Server error while fetching assignment submission",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Grade Assignment Submission
|--------------------------------------------------------------------------
*/

export const gradeAssignmentSubmission = async (req, res) => {
  try {
    // Only teachers, school admins and super admins can grade.
    if (
      req.user.role !== "teacher" &&
      req.user.role !== "schoolAdmin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        message: "You are not authorized to grade submissions",
      });
    }

    const { assignmentId, submissionId } = req.params;
    const { score, feedback } = req.body;

    // Validate score.
    if (score === undefined || score === null || score === "") {
      return res.status(400).json({
        message: "Score is required",
      });
    }

    const numericScore = Number(score);

    if (Number.isNaN(numericScore)) {
      return res.status(400).json({
        message: "Score must be a valid number",
      });
    }

    if (numericScore < 0 || numericScore > 100) {
      return res.status(400).json({
        message: "Score must be between 0 and 100",
      });
    }

    // Find assignment.
    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    // Teachers can only grade their own assignments.
    if (
      req.user.role === "teacher" &&
      assignment.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message:
          "You are not authorized to grade submissions for this assignment",
      });
    }

    // School admins can only grade assignments from their school.
    if (
      req.user.role === "schoolAdmin" &&
      assignment.school.toString() !== req.user.school.toString()
    ) {
      return res.status(403).json({
        message:
          "You are not authorized to grade submissions for this assignment",
      });
    }

    // Find the submission belonging to this assignment.
    const submission = await AssignmentSubmission.findOne({
      _id: submissionId,
      assignment: assignment._id,
      school: assignment.school,
    });

    if (!submission) {
      return res.status(404).json({
        message: "Assignment submission not found",
      });
    }

    // Make sure the submission actually contains something to grade.
    if (
      !submission.content?.trim() &&
      (!Array.isArray(submission.attachments) ||
        submission.attachments.length === 0)
    ) {
      return res.status(400).json({
        message: "This submission has no content or attachments to grade",
      });
    }

    submission.score = numericScore;
    submission.feedback =
      typeof feedback === "string" ? feedback.trim() : "";
    submission.status = "graded";

    await submission.save();

    const populatedSubmission =
      await AssignmentSubmission.findById(submission._id)
        .populate(
          "student",
          "studentId firstName middleName lastName profileImage"
        )
        .populate(
          "assignment",
          "title description instructions dueDate status"
        );

    return res.status(200).json({
      message: "Assignment graded successfully",
      submission: populatedSubmission,
    });
  } catch (error) {
    console.error("Grade assignment submission error:", error);

    return res.status(500).json({
      message: "Server error while grading assignment submission",
    });
  }
};

// @desc    Publish an assignment
// @route   PATCH /api/assignments/:assignmentId/publish
// @access  Teacher, School Admin, Super Admin
export const publishAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    // Teacher can only publish their own assignment
    if (
      req.user.role === "teacher" &&
      assignment.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to publish this assignment",
      });
    }

    // School admin can only publish assignments belonging to their school
    if (
      req.user.role === "schoolAdmin" &&
      assignment.school.toString() !== req.user.school.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to publish this assignment",
      });
    }

    // Only draft assignments can be published
    if (assignment.status !== "draft") {
      return res.status(400).json({
        message: `Assignment cannot be published because it is already ${assignment.status}`,
      });
    }

    assignment.status = "published";

    await assignment.save();

    return res.status(200).json({
      message: "Assignment published successfully",
      assignment,
    });
  } catch (error) {
    console.error("Publish assignment error:", error);

    return res.status(500).json({
      message: "Failed to publish assignment",
      error: error.message,
    });
  }
};


// @desc    Close an assignment
// @route   PATCH /api/assignments/:assignmentId/close
// @access  Teacher, School Admin, Super Admin
export const closeAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    // Teacher can only close their own assignment
    if (
      req.user.role === "teacher" &&
      assignment.teacher.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to close this assignment",
      });
    }

    // School admin can only close assignments belonging to their school
    if (
      req.user.role === "schoolAdmin" &&
      assignment.school.toString() !== req.user.school.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to close this assignment",
      });
    }

    // Only published assignments can be closed
    if (assignment.status !== "published") {
      return res.status(400).json({
        message: `Assignment cannot be closed because it is currently ${assignment.status}`,
      });
    }

    assignment.status = "closed";

    await assignment.save();

    return res.status(200).json({
      message: "Assignment closed successfully",
      assignment,
    });
  } catch (error) {
    console.error("Close assignment error:", error);

    return res.status(500).json({
      message: "Failed to close assignment",
      error: error.message,
    });
  }
};