import Result from "../models/Result.js";
import Student from "../models/Student.js";
import SchoolClass from "../models/SchoolClass.js";
import Subject from "../models/Subject.js";
import AcademicSession from "../models/AcademicSession.js";
import AcademicTerm from "../models/AcademicTerm.js";
import SubjectAssignment from "../models/SubjectAssignment.js";
import School from "../models/School.js";

// @desc    Create a student result
// @route   POST /api/results
// @access  Teacher
export const createResult = async (req, res) => {
  try {
    const {
      student,
      schoolClass,
      subject,
      academicSession,
      academicTerm,
      caScore,
      examScore,
    } = req.body;

    // --------------------------------------------------
    // 1. Basic validation
    // --------------------------------------------------

    if (
      !student ||
      !schoolClass ||
      !subject ||
      !academicSession ||
      !academicTerm ||
      caScore === undefined ||
      examScore === undefined
    ) {
      return res.status(400).json({
        message:
          "Student, class, subject, academic session, academic term, CA score, and exam score are required.",
      });
    }

    // --------------------------------------------------
    // 2. Verify authenticated user is a teacher
    // --------------------------------------------------

    if (req.user.role !== "teacher") {
      return res.status(403).json({
        message: "Only teachers can enter results.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "Teacher is not associated with a school.",
      });
    }

    // --------------------------------------------------
    // 3. Get the school
    // --------------------------------------------------

   const school = await School.findById(req.user.school);

if (!school) {
  return res.status(404).json({
    message: "School not found.",
  });
}

console.log("CLASS RANKING SCHOOL:", {
  id: school._id,
  name: school.name,
  enableClassRanking: school.enableClassRanking,
});

    if (!school.isActive) {
      return res.status(403).json({
        message: "School is inactive.",
      });
    }

    // --------------------------------------------------
    // 4. Get school's grading configuration
    // --------------------------------------------------

    const gradingSystem = school.gradingSystem;

    if (!gradingSystem) {
      return res.status(400).json({
        message: "School grading system has not been configured.",
      });
    }

    const {
      caMaximum,
      examMaximum,
      totalMaximum,
      gradingScale,
    } = gradingSystem;

    // --------------------------------------------------
    // 5. Validate scores
    // --------------------------------------------------

    const numericCaScore = Number(caScore);
    const numericExamScore = Number(examScore);

    if (Number.isNaN(numericCaScore) || Number.isNaN(numericExamScore)) {
      return res.status(400).json({
        message: "CA score and exam score must be valid numbers.",
      });
    }

    if (numericCaScore < 0 || numericCaScore > caMaximum) {
      return res.status(400).json({
        message: `CA score must be between 0 and ${caMaximum}.`,
      });
    }

    if (numericExamScore < 0 || numericExamScore > examMaximum) {
      return res.status(400).json({
        message: `Exam score must be between 0 and ${examMaximum}.`,
      });
    }

    // --------------------------------------------------
    // 6. Verify student belongs to teacher's school
    // --------------------------------------------------

    const studentRecord = await Student.findOne({
      _id: student,
      school: req.user.school,
    });

    if (!studentRecord) {
      return res.status(404).json({
        message: "Student not found in your school.",
      });
    }

    // --------------------------------------------------
    // 7. Verify class belongs to teacher's school
    // --------------------------------------------------

    const classRecord = await SchoolClass.findOne({
      _id: schoolClass,
      school: req.user.school,
    });

    if (!classRecord) {
      return res.status(404).json({
        message: "Class not found in your school.",
      });
    }

    // --------------------------------------------------
    // 8. Verify student belongs to the selected class
    // --------------------------------------------------

    if (String(studentRecord.schoolClass) !== String(schoolClass)) {
      return res.status(400).json({
        message: "Student does not belong to the selected class.",
      });
    }

    // --------------------------------------------------
    // 9. Verify subject belongs to teacher's school
    // --------------------------------------------------

    const subjectRecord = await Subject.findOne({
      _id: subject,
      school: req.user.school,
    });

    if (!subjectRecord) {
      return res.status(404).json({
        message: "Subject not found in your school.",
      });
    }

    // --------------------------------------------------
    // 10. Verify academic session belongs to school
    // --------------------------------------------------

    const sessionRecord = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!sessionRecord) {
      return res.status(404).json({
        message: "Academic session not found in your school.",
      });
    }

    // --------------------------------------------------
    // 11. Verify academic term belongs to school/session
    // --------------------------------------------------

    const termRecord = await AcademicTerm.findOne({
      _id: academicTerm,
      school: req.user.school,
      academicSession,
    });

    if (!termRecord) {
      return res.status(404).json({
        message: "Academic term not found for this school/session.",
      });
    }

    // --------------------------------------------------
    // 12. Verify teacher is assigned to this
    //     subject and class for the session
    // --------------------------------------------------

    const subjectAssignment = await SubjectAssignment.findOne({
      school: req.user.school,
      academicSession,
      schoolClass,
      subject,
      teacher: req.user._id,
      isActive: true,
    });

    if (!subjectAssignment) {
      return res.status(403).json({
        message:
          "You are not assigned to teach this subject for this class and academic session.",
      });
    }

    // --------------------------------------------------
    // 13. Prevent duplicate result
    // --------------------------------------------------

    const existingResult = await Result.findOne({
      school: req.user.school,
      student,
      schoolClass,
      subject,
      academicSession,
      academicTerm,
    });

    if (existingResult) {
      return res.status(409).json({
        message:
          "A result already exists for this student, subject, academic session, and term.",
        result: existingResult,
      });
    }

    // --------------------------------------------------
    // 14. Calculate total
    // --------------------------------------------------

    const total = numericCaScore + numericExamScore;

    if (total > totalMaximum) {
      return res.status(400).json({
        message: `Total score cannot exceed ${totalMaximum}.`,
      });
    }

    // --------------------------------------------------
    // 15. Determine grade and remark
    // --------------------------------------------------

    const gradingRule = gradingScale.find(
      (rule) => total >= rule.min && total <= rule.max
    );

    if (!gradingRule) {
      return res.status(400).json({
        message: `No grading rule exists for total score ${total}.`,
      });
    }

    // --------------------------------------------------
    // 16. Create result
    // --------------------------------------------------

    const result = await Result.create({
      school: req.user.school,
      student,
      schoolClass,
      subject,
      academicSession,
      academicTerm,

      caScore: numericCaScore,
      examScore: numericExamScore,
      total,

      grade: gradingRule.grade,
      remark: gradingRule.remark,

      gradingSystem: {
        caMaximum,
        examMaximum,
        totalMaximum,
        gradingScale: gradingScale.map((rule) => ({
          min: rule.min,
          max: rule.max,
          grade: rule.grade,
          remark: rule.remark,
        })),
      },

      status: "draft",
      enteredBy: req.user._id,
    });

    // --------------------------------------------------
    // 17. Return populated result
    // --------------------------------------------------

    const populatedResult = await Result.findById(result._id)
      .populate("student", "studentId firstName middleName lastName")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate("academicSession", "name startDate endDate")
      .populate("academicTerm", "name startDate endDate")
      .populate("enteredBy", "firstName lastName email");

    return res.status(201).json({
      message: "Result created successfully.",
      result: populatedResult,
    });
  } catch (error) {
    console.error("Create result error:", error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "A result already exists for this student, subject, academic session, and term.",
      });
    }

    return res.status(500).json({
      message: "Server error while creating result.",
      error: error.message,
    });
  }
};

export const updateResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { caScore, examScore } = req.body;

    // --------------------------------------------------
    // 1. Verify authenticated user is a teacher
    // --------------------------------------------------

    if (req.user.role !== "teacher") {
      return res.status(403).json({
        message: "Only teachers can edit results.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "Teacher is not associated with a school.",
      });
    }

    // --------------------------------------------------
    // 2. Find result within teacher's school
    // --------------------------------------------------

    const result = await Result.findOne({
      _id: id,
      school: req.user.school,
    });

    if (!result) {
      return res.status(404).json({
        message: "Result not found.",
      });
    }

    // --------------------------------------------------
    // 3. Only draft results can be edited
    // --------------------------------------------------

    if (result.status !== "draft") {
      return res.status(400).json({
        message: `This result cannot be edited because its status is "${result.status}".`,
      });
    }

    // --------------------------------------------------
    // 4. Verify teacher entered the result
    // --------------------------------------------------

    if (String(result.enteredBy) !== String(req.user._id)) {
      return res.status(403).json({
        message: "You can only edit results that you entered.",
      });
    }

    // --------------------------------------------------
    // 5. Get current school grading system
    // --------------------------------------------------

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    if (!school.isActive) {
      return res.status(403).json({
        message: "School is inactive.",
      });
    }

    const gradingSystem = school.gradingSystem;

    if (!gradingSystem) {
      return res.status(400).json({
        message: "School grading system has not been configured.",
      });
    }

    const {
      caMaximum,
      examMaximum,
      totalMaximum,
      gradingScale,
    } = gradingSystem;

    // --------------------------------------------------
    // 6. Validate submitted scores
    // --------------------------------------------------

    if (caScore === undefined || examScore === undefined) {
      return res.status(400).json({
        message: "CA score and exam score are required.",
      });
    }

    const numericCaScore = Number(caScore);
    const numericExamScore = Number(examScore);

    if (Number.isNaN(numericCaScore) || Number.isNaN(numericExamScore)) {
      return res.status(400).json({
        message: "CA score and exam score must be valid numbers.",
      });
    }

    if (numericCaScore < 0 || numericCaScore > caMaximum) {
      return res.status(400).json({
        message: `CA score must be between 0 and ${caMaximum}.`,
      });
    }

    if (numericExamScore < 0 || numericExamScore > examMaximum) {
      return res.status(400).json({
        message: `Exam score must be between 0 and ${examMaximum}.`,
      });
    }

    // --------------------------------------------------
    // 7. Calculate new total
    // --------------------------------------------------

    const total = numericCaScore + numericExamScore;

    if (total > totalMaximum) {
      return res.status(400).json({
        message: `Total score cannot exceed ${totalMaximum}.`,
      });
    }

    // --------------------------------------------------
    // 8. Determine new grade and remark
    // --------------------------------------------------

    const gradingRule = gradingScale.find(
      (rule) => total >= rule.min && total <= rule.max
    );

    if (!gradingRule) {
      return res.status(400).json({
        message: `No grading rule exists for total score ${total}.`,
      });
    }

    // --------------------------------------------------
    // 9. Update result
    // --------------------------------------------------

    result.caScore = numericCaScore;
    result.examScore = numericExamScore;
    result.total = total;
    result.grade = gradingRule.grade;
    result.remark = gradingRule.remark;

    // --------------------------------------------------
    // 10. Update grading system snapshot
    // --------------------------------------------------

    result.gradingSystem = {
      caMaximum,
      examMaximum,
      totalMaximum,
      gradingScale: gradingScale.map((rule) => ({
        min: rule.min,
        max: rule.max,
        grade: rule.grade,
        remark: rule.remark,
      })),
    };

    await result.save();

    // --------------------------------------------------
    // 11. Return populated result
    // --------------------------------------------------

    const populatedResult = await Result.findById(result._id)
      .populate("student", "studentId firstName middleName lastName")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate("academicSession", "name startDate endDate")
      .populate("academicTerm", "name startDate endDate")
      .populate("enteredBy", "firstName lastName email");

    return res.status(200).json({
      message: "Result updated successfully.",
      result: populatedResult,
    });
  } catch (error) {
    console.error("Update result error:", error);

    return res.status(500).json({
      message: "Server error while updating result.",
      error: error.message,
    });
  }
};


export const submitResultForReview = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "teacher") {
      return res.status(403).json({
        message: "Only teachers can submit results for review.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "Teacher is not associated with a school.",
      });
    }

    const result = await Result.findOne({
      _id: id,
      school: req.user.school,
    });

    if (!result) {
      return res.status(404).json({
        message: "Result not found.",
      });
    }

    if (String(result.enteredBy) !== String(req.user._id)) {
      return res.status(403).json({
        message: "You can only submit results that you entered.",
      });
    }

    if (result.status !== "draft") {
      return res.status(400).json({
        message: "Only draft results can be submitted for review.",
      });
    }

    result.status = "pending_review";

    await result.save();

    const populatedResult = await Result.findById(result._id)
      .populate("student", "studentId firstName middleName lastName")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate("academicSession", "name startDate endDate")
      .populate("academicTerm", "name startDate endDate")
      .populate("enteredBy", "firstName lastName email");

    return res.status(200).json({
      message: "Result submitted for review successfully.",
      result: populatedResult,
    });
  } catch (error) {
    console.error("Submit result for review error:", error);

    return res.status(500).json({
      message: "Server error while submitting result for review.",
      error: error.message,
    });
  }
};


// @desc    Publish a result after school admin review
// @route   POST /api/results/:id/publish
// @access  School Admin
export const publishResult = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "schoolAdmin") {
      return res.status(403).json({
        message: "Only school admins can publish results.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "School admin is not associated with a school.",
      });
    }

    const result = await Result.findOne({
      _id: id,
      school: req.user.school,
    });

    if (!result) {
      return res.status(404).json({
        message: "Result not found.",
      });
    }

    if (result.status === "published") {
      return res.status(400).json({
        message: "This result has already been published.",
      });
    }

    if (result.status === "locked") {
      return res.status(400).json({
        message: "This result is locked and cannot be published.",
      });
    }

    if (result.status !== "pending_review") {
      return res.status(400).json({
        message: "Only results pending review can be published.",
      });
    }

    result.status = "published";
    result.publishedAt = new Date();

    await result.save();

    const populatedResult = await Result.findById(result._id)
      .populate("student", "studentId firstName middleName lastName")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate("academicSession", "name startDate endDate")
      .populate("academicTerm", "name startDate endDate")
      .populate("enteredBy", "firstName lastName email");

    return res.status(200).json({
      message: "Result published successfully.",
      result: populatedResult,
    });
  } catch (error) {
    console.error("Publish result error:", error);

    return res.status(500).json({
      message: "Server error while publishing result.",
      error: error.message,
    });
  }
};


// @desc    Reject a result and send it back to teacher
// @route   POST /api/results/:id/reject
// @access  School Admin
export const rejectResult = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "schoolAdmin") {
      return res.status(403).json({
        message: "Only school admins can reject results.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "School admin is not associated with a school.",
      });
    }

    const result = await Result.findOne({
      _id: id,
      school: req.user.school,
    });

    if (!result) {
      return res.status(404).json({
        message: "Result not found.",
      });
    }

    if (result.status !== "pending_review") {
      return res.status(400).json({
        message: "Only results pending review can be rejected.",
      });
    }

    result.status = "draft";

    await result.save();

    const populatedResult = await Result.findById(result._id)
      .populate("student", "studentId firstName middleName lastName")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate("academicSession", "name startDate endDate")
      .populate("academicTerm", "name startDate endDate")
      .populate("enteredBy", "firstName lastName email");

    return res.status(200).json({
      message: "Result rejected and returned to draft successfully.",
      result: populatedResult,
    });
  } catch (error) {
    console.error("Reject result error:", error);

    return res.status(500).json({
      message: "Server error while rejecting result.",
      error: error.message,
    });
  }
};


// @desc    Lock a published result permanently
// @route   POST /api/results/:id/lock
// @access  School Admin
export const lockResult = async (req, res) => {
  try {
    const { id } = req.params;

    // --------------------------------------------------
    // 1. Verify authenticated user is a school admin
    // --------------------------------------------------

    if (req.user.role !== "schoolAdmin") {
      return res.status(403).json({
        message: "Only school admins can lock results.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "School admin is not associated with a school.",
      });
    }

    // --------------------------------------------------
    // 2. Find result within admin's school
    // --------------------------------------------------

    const result = await Result.findOne({
      _id: id,
      school: req.user.school,
    });

    if (!result) {
      return res.status(404).json({
        message: "Result not found.",
      });
    }

    // --------------------------------------------------
    // 3. Prevent locking an already locked result
    // --------------------------------------------------

    if (result.status === "locked") {
      return res.status(400).json({
        message: "This result is already locked.",
      });
    }

    // --------------------------------------------------
    // 4. Only published results can be locked
    // --------------------------------------------------

    if (result.status !== "published") {
      return res.status(400).json({
        message: "Only published results can be locked.",
      });
    }

    // --------------------------------------------------
    // 5. Lock result
    // --------------------------------------------------

    result.status = "locked";
    result.lockedAt = new Date();

    await result.save();

    // --------------------------------------------------
    // 6. Return populated result
    // --------------------------------------------------

    const populatedResult = await Result.findById(result._id)
      .populate("student", "studentId firstName middleName lastName")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate("academicSession", "name startDate endDate")
      .populate("academicTerm", "name startDate endDate")
      .populate("enteredBy", "firstName lastName email");

    return res.status(200).json({
      message: "Result locked successfully.",
      result: populatedResult,
    });
  } catch (error) {
    console.error("Lock result error:", error);

    return res.status(500).json({
      message: "Server error while locking result.",
      error: error.message,
    });
  }
};

// @desc    Get logged-in student's published and locked results
// @route   GET /api/results/my-results
// @access  Student
export const getMyResults = async (req, res) => {
  try {
    // --------------------------------------------------
    // 1. Verify authenticated user is a student
    // --------------------------------------------------

    if (req.user.role !== "student") {
      return res.status(403).json({
        message: "Only students can access their results.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "Student is not associated with a school.",
      });
    }

    // --------------------------------------------------
    // 2. Find the Student record linked to this user
    // --------------------------------------------------

    const student = await Student.findOne({
      user: req.user._id,
      school: req.user.school,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student record not found.",
      });
    }

    // --------------------------------------------------
    // 3. Optional filters
    // --------------------------------------------------

    const { academicSession, academicTerm } = req.query;

    // --------------------------------------------------
    // 4. Build result query
    // --------------------------------------------------

    const query = {
      school: req.user.school,
      student: student._id,

      // Students can only see finalized/published results
      status: {
        $in: ["published", "locked"],
      },
    };

    if (academicSession) {
      query.academicSession = academicSession;
    }

    if (academicTerm) {
      query.academicTerm = academicTerm;
    }

    // --------------------------------------------------
    // 5. Get results
    // --------------------------------------------------

    const results = await Result.find(query)
      .populate("subject", "name code")
      .populate("schoolClass", "name arm section")
      .populate("academicSession", "name startDate endDate")
      .populate("academicTerm", "name startDate endDate")
      .sort({
        academicSession: 1,
        academicTerm: 1,
        subject: 1,
      });

    // --------------------------------------------------
    // 6. Return results
    // --------------------------------------------------

    return res.status(200).json({
      message: "Student results retrieved successfully.",
      student: {
        _id: student._id,
        studentId: student.studentId,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
      },
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("Get my results error:", error);

    return res.status(500).json({
      message: "Server error while retrieving student results.",
      error: error.message,
    });
  }
};

// @desc    Get class performance analytics
// @route   GET /api/results/analytics/class-averages
// @access  School Admin
export const getClassAverages = async (req, res) => {
  try {
    const { schoolClass, academicSession, academicTerm } = req.query;

    // --------------------------------------------------
    // 1. Verify authenticated user
    // --------------------------------------------------

    if (req.user.role !== "schoolAdmin") {
      return res.status(403).json({
        message: "Only school admins can access class analytics.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "School admin is not associated with a school.",
      });
    }

    // --------------------------------------------------
    // 2. Validate required query parameters
    // --------------------------------------------------

    if (!schoolClass || !academicSession || !academicTerm) {
      return res.status(400).json({
        message:
          "schoolClass, academicSession, and academicTerm are required.",
      });
    }

    // --------------------------------------------------
    // 3. Verify class belongs to the school
    // --------------------------------------------------

    const classRecord = await SchoolClass.findOne({
      _id: schoolClass,
      school: req.user.school,
    });

    if (!classRecord) {
      return res.status(404).json({
        message: "Class not found in your school.",
      });
    }

    // --------------------------------------------------
    // 4. Verify academic session belongs to the school
    // --------------------------------------------------

    const sessionRecord = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!sessionRecord) {
      return res.status(404).json({
        message: "Academic session not found in your school.",
      });
    }

    // --------------------------------------------------
    // 5. Verify academic term belongs to the session
    // --------------------------------------------------

    const termRecord = await AcademicTerm.findOne({
      _id: academicTerm,
      school: req.user.school,
      academicSession,
    });

    if (!termRecord) {
      return res.status(404).json({
        message: "Academic term not found for this school/session.",
      });
    }

    // --------------------------------------------------
    // 6. Get only finalized results
    // --------------------------------------------------

    const resultQuery = {
      school: req.user.school,
      schoolClass,
      academicSession,
      academicTerm,
      status: {
        $in: ["published", "locked"],
      },
    };

    const results = await Result.find(resultQuery)
      .populate("subject", "name code")
      .populate("student", "studentId firstName middleName lastName")
      .sort({ subject: 1, total: -1 });

    if (results.length === 0) {
      return res.status(200).json({
        message: "No published or locked results found for this class.",
        class: {
          _id: classRecord._id,
          name: classRecord.name,
          arm: classRecord.arm,
          section: classRecord.section,
        },
        academicSession: {
          _id: sessionRecord._id,
          name: sessionRecord.name,
        },
        academicTerm: {
          _id: termRecord._id,
          name: termRecord.name,
        },
        summary: {
          totalStudents: 0,
          totalResults: 0,
          overallAverage: 0,
        },
        subjects: [],
      });
    }

    // --------------------------------------------------
    // 7. Calculate overall class average
    // --------------------------------------------------

    const totalScore = results.reduce(
      (sum, result) => sum + result.total,
      0
    );

    const overallAverage = Number(
      (totalScore / results.length).toFixed(2)
    );

    const uniqueStudents = new Set(
      results.map((result) => String(result.student._id))
    );

    // --------------------------------------------------
    // 8. Group results by subject
    // --------------------------------------------------

    const subjectMap = new Map();

    for (const result of results) {
      const subjectId = String(result.subject._id);

      if (!subjectMap.has(subjectId)) {
        subjectMap.set(subjectId, {
          subject: result.subject,
          totalScore: 0,
          resultCount: 0,
          highestScore: result.total,
          lowestScore: result.total,
        });
      }

      const subjectData = subjectMap.get(subjectId);

      subjectData.totalScore += result.total;
      subjectData.resultCount += 1;

      if (result.total > subjectData.highestScore) {
        subjectData.highestScore = result.total;
      }

      if (result.total < subjectData.lowestScore) {
        subjectData.lowestScore = result.total;
      }
    }

    const subjects = Array.from(subjectMap.values())
      .map((subjectData) => ({
        subject: subjectData.subject,
        studentCount: subjectData.resultCount,
        averageScore: Number(
          (subjectData.totalScore / subjectData.resultCount).toFixed(2)
        ),
        highestScore: subjectData.highestScore,
        lowestScore: subjectData.lowestScore,
      }))
      .sort((a, b) =>
        a.subject.name.localeCompare(b.subject.name)
      );

    // --------------------------------------------------
    // 9. Return analytics
    // --------------------------------------------------

    return res.status(200).json({
      message: "Class analytics retrieved successfully.",
      class: {
        _id: classRecord._id,
        name: classRecord.name,
        arm: classRecord.arm,
        section: classRecord.section,
      },
      academicSession: {
        _id: sessionRecord._id,
        name: sessionRecord.name,
      },
      academicTerm: {
        _id: termRecord._id,
        name: termRecord.name,
      },
      summary: {
        totalStudents: uniqueStudents.size,
        totalResults: results.length,
        overallAverage,
      },
      subjects,
    });
  } catch (error) {
    console.error("Get class averages error:", error);

    return res.status(500).json({
      message: "Server error while retrieving class analytics.",
      error: error.message,
    });
  }
};


export const getClassRanking = async (req, res) => {
  try {
    const { schoolClass, academicSession, academicTerm } = req.query;

    // --------------------------------------------------
    // 1. Verify authenticated user
    // --------------------------------------------------

    if (req.user.role !== "schoolAdmin") {
      return res.status(403).json({
        message: "Only school admins can access class rankings.",
      });
    }

    // --------------------------------------------------
    // 2. Verify school association
    // --------------------------------------------------

    if (!req.user.school) {
      return res.status(403).json({
        message: "School admin is not associated with a school.",
      });
    }

    // --------------------------------------------------
    // 3. Get school
    // --------------------------------------------------

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    console.log("CLASS RANKING SCHOOL:", {
      id: school._id,
      name: school.name,
      enableClassRanking: school.enableClassRanking,
    });

    // --------------------------------------------------
    // 4. Check whether school is active
    // --------------------------------------------------

    if (!school.isActive) {
      return res.status(403).json({
        message: "School is inactive.",
      });
    }

    // --------------------------------------------------
    // 5. Check whether class ranking is enabled
    // --------------------------------------------------

    if (school.enableClassRanking !== true) {
      return res.status(403).json({
        message: "Class ranking is disabled for this school.",
        enableClassRanking: school.enableClassRanking,
      });
    }

    // --------------------------------------------------
    // 6. Validate required query parameters
    // --------------------------------------------------

    if (!schoolClass || !academicSession || !academicTerm) {
      return res.status(400).json({
        message:
          "schoolClass, academicSession, and academicTerm are required.",
      });
    }

    // --------------------------------------------------
    // 7. Verify class belongs to the school
    // --------------------------------------------------

    const classRecord = await SchoolClass.findOne({
      _id: schoolClass,
      school: req.user.school,
    });

    if (!classRecord) {
      return res.status(404).json({
        message: "Class not found in your school.",
      });
    }

    // --------------------------------------------------
    // 8. Verify academic session belongs to the school
    // --------------------------------------------------

    const sessionRecord = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!sessionRecord) {
      return res.status(404).json({
        message: "Academic session not found in your school.",
      });
    }

    // --------------------------------------------------
    // 9. Verify academic term belongs to the session
    // --------------------------------------------------

    const termRecord = await AcademicTerm.findOne({
      _id: academicTerm,
      school: req.user.school,
      academicSession,
    });

    if (!termRecord) {
      return res.status(404).json({
        message: "Academic term not found for this school/session.",
      });
    }

    // --------------------------------------------------
    // 10. Get only published/locked results
    // --------------------------------------------------

    const results = await Result.find({
      school: req.user.school,
      schoolClass,
      academicSession,
      academicTerm,
      status: {
        $in: ["published", "locked"],
      },
    })
      .populate(
        "student",
        "studentId firstName middleName lastName"
      )
      .populate("subject", "name code")
      .sort({ student: 1 });

    // --------------------------------------------------
    // 11. Handle no results
    // --------------------------------------------------

    if (results.length === 0) {
      return res.status(200).json({
        message: "No published or locked results found for this class.",

        class: {
          _id: classRecord._id,
          name: classRecord.name,
          arm: classRecord.arm,
          section: classRecord.section,
        },

        academicSession: {
          _id: sessionRecord._id,
          name: sessionRecord.name,
        },

        academicTerm: {
          _id: termRecord._id,
          name: termRecord.name,
        },

        summary: {
          totalStudents: 0,
        },

        rankings: [],
      });
    }

    // --------------------------------------------------
    // 12. Group results by student
    // --------------------------------------------------

    const studentMap = new Map();

    for (const result of results) {
      if (!result.student) {
        continue;
      }

      const studentId = String(result.student._id);

      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          student: result.student,
          totalScore: 0,
          subjectCount: 0,
        });
      }

      const studentData = studentMap.get(studentId);

      studentData.totalScore += Number(result.total);
      studentData.subjectCount += 1;
    }

    // --------------------------------------------------
    // 13. Calculate averages
    // --------------------------------------------------

    const rankings = Array.from(studentMap.values())
      .filter((studentData) => studentData.subjectCount > 0)
      .map((studentData) => {
        const averageScore =
          studentData.totalScore / studentData.subjectCount;

        return {
          student: studentData.student,

          totalScore: Number(
            studentData.totalScore.toFixed(2)
          ),

          subjectCount: studentData.subjectCount,

          averageScore: Number(
            averageScore.toFixed(2)
          ),
        };
      });

    // --------------------------------------------------
    // 14. Sort by average score
    // --------------------------------------------------

    rankings.sort((a, b) => {
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }

      const aName =
        `${a.student.firstName || ""} ${
          a.student.lastName || ""
        }`
          .trim()
          .toLowerCase();

      const bName =
        `${b.student.firstName || ""} ${
          b.student.lastName || ""
        }`
          .trim()
          .toLowerCase();

      return aName.localeCompare(bName);
    });

    // --------------------------------------------------
    // 15. Assign positions
    // --------------------------------------------------
    //
    // Ranking uses average score only.
    //
    // Example:
    //
    // 85 -> 1
    // 80 -> 2
    // 80 -> 2
    // 75 -> 4
    //
    // --------------------------------------------------

    let previousAverage = null;
    let previousPosition = 0;

    rankings.forEach((ranking, index) => {
      if (ranking.averageScore === previousAverage) {
        ranking.position = previousPosition;
      } else {
        ranking.position = index + 1;
      }

      previousAverage = ranking.averageScore;
      previousPosition = ranking.position;
    });

    // --------------------------------------------------
    // 16. Return rankings
    // --------------------------------------------------

    return res.status(200).json({
      message: "Class rankings retrieved successfully.",

      class: {
        _id: classRecord._id,
        name: classRecord.name,
        arm: classRecord.arm,
        section: classRecord.section,
      },

      academicSession: {
        _id: sessionRecord._id,
        name: sessionRecord.name,
      },

      academicTerm: {
        _id: termRecord._id,
        name: termRecord.name,
      },

      summary: {
        totalStudents: rankings.length,
      },

      rankings,
    });
  } catch (error) {
    console.error("Get class ranking error:", error);

    return res.status(500).json({
      message: "Server error while retrieving class rankings.",
      error: error.message,
    });
  }
};

// @desc    Get a student's complete term report
// @route   GET /api/results/student-report
// @access  School Admin
export const getStudentReport = async (req, res) => {
  try {
    const {
      student,
      schoolClass,
      academicSession,
      academicTerm,
    } = req.query;

    if (req.user.role !== "schoolAdmin") {
      return res.status(403).json({
        message: "Only school admins can access student reports.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "School admin is not associated with a school.",
      });
    }

    if (
      !student ||
      !schoolClass ||
      !academicSession ||
      !academicTerm
    ) {
      return res.status(400).json({
        message:
          "student, schoolClass, academicSession, and academicTerm are required.",
      });
    }

    // ---------------------------------------------------------
    // SCHOOL
    // ---------------------------------------------------------

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    if (!school.isActive) {
      return res.status(403).json({
        message: "School is inactive.",
      });
    }

    // ---------------------------------------------------------
    // STUDENT
    // ---------------------------------------------------------

    const studentRecord = await Student.findOne({
      _id: student,
      school: req.user.school,
    });

    if (!studentRecord) {
      return res.status(404).json({
        message: "Student not found in your school.",
      });
    }

    // ---------------------------------------------------------
    // CLASS
    // ---------------------------------------------------------

    const classRecord = await SchoolClass.findOne({
      _id: schoolClass,
      school: req.user.school,
    });

    if (!classRecord) {
      return res.status(404).json({
        message: "Class not found in your school.",
      });
    }

    if (String(studentRecord.schoolClass) !== String(schoolClass)) {
      return res.status(400).json({
        message: "Student does not belong to the selected class.",
      });
    }

    // ---------------------------------------------------------
    // ACADEMIC SESSION
    // ---------------------------------------------------------

    const sessionRecord = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!sessionRecord) {
      return res.status(404).json({
        message: "Academic session not found in your school.",
      });
    }

    // ---------------------------------------------------------
    // ACADEMIC TERM
    // ---------------------------------------------------------

    const termRecord = await AcademicTerm.findOne({
      _id: academicTerm,
      school: req.user.school,
      academicSession,
    });

    if (!termRecord) {
      return res.status(404).json({
        message: "Academic term not found for this school/session.",
      });
    }

    // ---------------------------------------------------------
    // CLASS SUBJECT ASSIGNMENTS
    // ---------------------------------------------------------

    const subjectAssignments = await SubjectAssignment.find({
      school: req.user.school,
      schoolClass,
      academicSession,
      isActive: true,
    }).populate("subject", "name code");

    // Remove duplicate subjects in case the same subject has
    // somehow been assigned more than once.
    const subjectMap = new Map();

    for (const assignment of subjectAssignments) {
      if (assignment.subject?._id) {
        subjectMap.set(
          String(assignment.subject._id),
          assignment.subject
        );
      }
    }

    const assignedSubjects = Array.from(subjectMap.values());

    const expectedSubjectCount = assignedSubjects.length;

    // ---------------------------------------------------------
    // STUDENT RESULTS
    // ---------------------------------------------------------

    const results = await Result.find({
      school: req.user.school,
      student,
      schoolClass,
      academicSession,
      academicTerm,
      status: {
        $in: ["published", "locked"],
      },
    })
      .populate("subject", "name code")
      .sort({ "subject.name": 1 });

    // ---------------------------------------------------------
    // SUBJECT COMPLETION
    // ---------------------------------------------------------

    const resultSubjectIds = new Set(
      results.map((result) => String(result.subject?._id))
    );

    const completedSubjectCount = results.length;

    const missingSubjects = assignedSubjects
      .filter(
        (subject) =>
          !resultSubjectIds.has(String(subject._id))
      )
      .map((subject) => ({
        _id: subject._id,
        name: subject.name,
        code: subject.code,
      }));

    const isComplete =
      expectedSubjectCount > 0 &&
      completedSubjectCount >= expectedSubjectCount &&
      missingSubjects.length === 0;

    // ---------------------------------------------------------
    // NO PUBLISHED / LOCKED RESULTS
    // ---------------------------------------------------------

    if (results.length === 0) {
      return res.status(200).json({
        message: "No published or locked results found for this student.",

        school: {
          _id: school._id,
          name: school.name,
          email: school.email,
          phone: school.phone,
          address: school.address,
          city: school.city,
          state: school.state,
          country: school.country,
          logo: school.logo,
        },

        student: {
          _id: studentRecord._id,
          studentId: studentRecord.studentId,
          firstName: studentRecord.firstName,
          middleName: studentRecord.middleName,
          lastName: studentRecord.lastName,
        },

        class: {
          _id: classRecord._id,
          name: classRecord.name,
          arm: classRecord.arm,
          section: classRecord.section,
        },

        academicSession: {
          _id: sessionRecord._id,
          name: sessionRecord.name,
        },

        academicTerm: {
          _id: termRecord._id,
          name: termRecord.name,
        },

        summary: {
          totalSubjects: 0,
          expectedSubjects: expectedSubjectCount,
          completedSubjects: 0,
          totalScore: 0,
          averageScore: 0,
          overallGrade: null,
          overallRemark: null,
          isComplete: false,
        },

        ranking: {
          enabled: school.enableClassRanking === true,
          position: null,
          totalStudents: 0,
          rankedStudents: 0,
          eligible: false,
        },

        position: null,

        missingSubjects,

        subjects: [],
      });
    }

    // ---------------------------------------------------------
    // OVERALL PERFORMANCE
    // ---------------------------------------------------------

    const totalScore = results.reduce(
      (sum, result) => sum + Number(result.total),
      0
    );

    const totalSubjects = results.length;

    const averageScore = Number(
      (totalScore / totalSubjects).toFixed(2)
    );

    // Determine overall grade and remark using the school's
    // current grading scale.
    const overallGradeRule =
      school.gradingSystem?.gradingScale?.find(
        (scale) =>
          averageScore >= Number(scale.min) &&
          averageScore <= Number(scale.max)
      );

    const overallGrade = overallGradeRule?.grade || null;
    const overallRemark = overallGradeRule?.remark || null;

    // ---------------------------------------------------------
    // SUBJECT RESULTS
    // ---------------------------------------------------------

    const subjects = results.map((result) => ({
      resultId: result._id,

      subject: result.subject,

      caScore: result.caScore,

      examScore: result.examScore,

      total: result.total,

      grade: result.grade,

      remark: result.remark,

      status: result.status,
    }));

    // ---------------------------------------------------------
    // CLASS SIZE
    // ---------------------------------------------------------

    const activeStudents = await Student.find({
      school: req.user.school,
      schoolClass,
      isActive: true,
    }).select("_id");

    const totalStudents = activeStudents.length;

    // ---------------------------------------------------------
    // RANKING
    // ---------------------------------------------------------

    let position = null;
    let rankedStudents = 0;
    let rankingEligible = false;

    if (
      school.enableClassRanking === true &&
      expectedSubjectCount > 0
    ) {
      const classResults = await Result.find({
        school: req.user.school,
        schoolClass,
        academicSession,
        academicTerm,
        status: {
          $in: ["published", "locked"],
        },
      }).select("student subject total");

      // Group results by student.
      const studentResultsMap = new Map();

      for (const result of classResults) {
        const studentId = String(result.student);

        if (!studentResultsMap.has(studentId)) {
          studentResultsMap.set(studentId, {
            subjects: new Set(),
            totalScore: 0,
          });
        }

        const studentData =
          studentResultsMap.get(studentId);

        studentData.subjects.add(
          String(result.subject)
        );

        studentData.totalScore += Number(result.total);
      }

      // Only students who have results for EVERY subject
      // assigned to the class are eligible for ranking.
      const eligibleRankings = [];

      for (const [
        studentId,
        data,
      ] of studentResultsMap.entries()) {
        if (
          data.subjects.size !== expectedSubjectCount
        ) {
          continue;
        }

        let hasAllSubjects = true;

        for (const subject of assignedSubjects) {
          if (
            !data.subjects.has(
              String(subject._id)
            )
          ) {
            hasAllSubjects = false;
            break;
          }
        }

        if (!hasAllSubjects) {
          continue;
        }

        const average =
          data.totalScore / expectedSubjectCount;

        eligibleRankings.push({
          studentId,
          totalScore: data.totalScore,
          averageScore: average,
        });
      }

      eligibleRankings.sort((a, b) => {
        if (b.averageScore !== a.averageScore) {
          return b.averageScore - a.averageScore;
        }

        return String(a.studentId).localeCompare(
          String(b.studentId)
        );
      });

      let previousAverage = null;
      let previousPosition = 0;

      eligibleRankings.forEach(
        (ranking, index) => {
          const roundedAverage = Number(
            ranking.averageScore.toFixed(2)
          );

          if (
            roundedAverage === previousAverage
          ) {
            ranking.position = previousPosition;
          } else {
            ranking.position = index + 1;
          }

          ranking.averageScore = roundedAverage;

          previousAverage = roundedAverage;
          previousPosition = ranking.position;
        }
      );

      rankedStudents = eligibleRankings.length;

      const studentRanking =
        eligibleRankings.find(
          (ranking) =>
            ranking.studentId === String(student)
        );

      if (studentRanking) {
        position = studentRanking.position;
        rankingEligible = true;
      }
    }

    // ---------------------------------------------------------
    // RESPONSE
    // ---------------------------------------------------------

    return res.status(200).json({
      message: "Student report retrieved successfully.",

      school: {
        _id: school._id,
        name: school.name,
        email: school.email,
        phone: school.phone,
        address: school.address,
        city: school.city,
        state: school.state,
        country: school.country,
        logo: school.logo,
      },

      student: {
        _id: studentRecord._id,
        studentId: studentRecord.studentId,
        firstName: studentRecord.firstName,
        middleName: studentRecord.middleName,
        lastName: studentRecord.lastName,
      },

      class: {
        _id: classRecord._id,
        name: classRecord.name,
        arm: classRecord.arm,
        section: classRecord.section,
      },

      academicSession: {
        _id: sessionRecord._id,
        name: sessionRecord.name,
      },

      academicTerm: {
        _id: termRecord._id,
        name: termRecord.name,
      },

      summary: {
        totalSubjects,
        expectedSubjects: expectedSubjectCount,
        completedSubjects: completedSubjectCount,
        totalScore,
        averageScore,
        overallGrade,
        overallRemark,
        isComplete,
      },

      ranking: {
        enabled: school.enableClassRanking === true,
        position,
        totalStudents,
        rankedStudents,
        eligible: rankingEligible,
      },

      // Kept for backward compatibility.
      position,

      missingSubjects,

      subjects,
    });
  } catch (error) {
    console.error(
      "Get student report error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while retrieving student report.",
      error: error.message,
    });
  }
};

// @desc    Get results entered by the logged-in teacher
// @route   GET /api/results/teacher-results
// @access  Teacher
export const getTeacherResults = async (req, res) => {
  try {
    const {
      schoolClass,
      subject,
      academicSession,
      academicTerm,
      status,
    } = req.query;

    if (req.user.role !== "teacher") {
      return res.status(403).json({
        message: "Only teachers can access teacher results.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "Teacher is not associated with a school.",
      });
    }

    if (
      !schoolClass ||
      !subject ||
      !academicSession ||
      !academicTerm
    ) {
      return res.status(400).json({
        message:
          "schoolClass, subject, academicSession, and academicTerm are required.",
      });
    }

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    if (!school.isActive) {
      return res.status(403).json({
        message: "School is inactive.",
      });
    }

    const classRecord = await SchoolClass.findOne({
      _id: schoolClass,
      school: req.user.school,
    });

    if (!classRecord) {
      return res.status(404).json({
        message: "Class not found in your school.",
      });
    }

    const subjectRecord = await Subject.findOne({
      _id: subject,
      school: req.user.school,
    });

    if (!subjectRecord) {
      return res.status(404).json({
        message: "Subject not found in your school.",
      });
    }

    const sessionRecord = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!sessionRecord) {
      return res.status(404).json({
        message: "Academic session not found in your school.",
      });
    }

    const termRecord = await AcademicTerm.findOne({
      _id: academicTerm,
      school: req.user.school,
      academicSession,
    });

    if (!termRecord) {
      return res.status(404).json({
        message: "Academic term not found for this school/session.",
      });
    }

    const query = {
      school: req.user.school,
      enteredBy: req.user._id,
      schoolClass,
      subject,
      academicSession,
      academicTerm,
    };

    if (status) {
      const allowedStatuses = [
        "draft",
        "pending_review",
        "published",
        "locked",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message:
            "Invalid status. Allowed values are draft, pending_review, published, and locked.",
        });
      }

      query.status = status;
    }

    const results = await Result.find(query)
      .populate("student", "studentId firstName middleName lastName")
      .populate("subject", "name code")
      .populate("schoolClass", "name arm section")
      .populate("academicSession", "name")
      .populate("academicTerm", "name")
      .sort({
        "student.lastName": 1,
        "student.firstName": 1,
      });

    return res.status(200).json({
      message: "Teacher results retrieved successfully.",
      class: {
        _id: classRecord._id,
        name: classRecord.name,
        arm: classRecord.arm,
        section: classRecord.section,
      },
      subject: {
        _id: subjectRecord._id,
        name: subjectRecord.name,
        code: subjectRecord.code,
      },
      academicSession: {
        _id: sessionRecord._id,
        name: sessionRecord.name,
      },
      academicTerm: {
        _id: termRecord._id,
        name: termRecord.name,
      },
      summary: {
        totalResults: results.length,
      },
      results,
    });
  } catch (error) {
    console.error("Get teacher results error:", error);

    return res.status(500).json({
      message: "Server error while retrieving teacher results.",
      error: error.message,
    });
  }
};

// @desc    Get students in a class for teacher result entry
// @route   GET /api/results/teacher-roster
// @access  Teacher
export const getTeacherRoster = async (req, res) => {
  try {
    const {
      schoolClass,
      subject,
      academicSession,
      academicTerm,
    } = req.query;

    if (req.user.role !== "teacher") {
      return res.status(403).json({
        message: "Only teachers can access the result roster.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "Teacher is not associated with a school.",
      });
    }

    if (
      !schoolClass ||
      !subject ||
      !academicSession ||
      !academicTerm
    ) {
      return res.status(400).json({
        message:
          "schoolClass, subject, academicSession, and academicTerm are required.",
      });
    }

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    if (!school.isActive) {
      return res.status(403).json({
        message: "School is inactive.",
      });
    }

    const classRecord = await SchoolClass.findOne({
      _id: schoolClass,
      school: req.user.school,
    });

    if (!classRecord) {
      return res.status(404).json({
        message: "Class not found in your school.",
      });
    }

    const subjectRecord = await Subject.findOne({
      _id: subject,
      school: req.user.school,
    });

    if (!subjectRecord) {
      return res.status(404).json({
        message: "Subject not found in your school.",
      });
    }

    const sessionRecord = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!sessionRecord) {
      return res.status(404).json({
        message: "Academic session not found in your school.",
      });
    }

    const termRecord = await AcademicTerm.findOne({
      _id: academicTerm,
      school: req.user.school,
      academicSession,
    });

    if (!termRecord) {
      return res.status(404).json({
        message: "Academic term not found for this school/session.",
      });
    }

    const students = await Student.find({
      school: req.user.school,
      schoolClass,
      isActive: true,
    })
      .select("studentId firstName middleName lastName")
      .sort({
        lastName: 1,
        firstName: 1,
      });

    const results = await Result.find({
      school: req.user.school,
      schoolClass,
      subject,
      academicSession,
      academicTerm,
    }).select(
      "student caScore examScore total grade remark status _id"
    );

    const resultMap = new Map();

    for (const result of results) {
      resultMap.set(String(result.student), result);
    }

    const roster = students.map((student) => {
      const result = resultMap.get(String(student._id));

      return {
        student: {
          _id: student._id,
          studentId: student.studentId,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
        },

        hasResult: Boolean(result),

        result: result
          ? {
              resultId: result._id,
              caScore: result.caScore,
              examScore: result.examScore,
              total: result.total,
              grade: result.grade,
              remark: result.remark,
              status: result.status,
            }
          : null,
      };
    });

    const studentsWithResults = roster.filter(
      (item) => item.hasResult
    ).length;

    const studentsWithoutResults = roster.length - studentsWithResults;

    return res.status(200).json({
      message: "Teacher result roster retrieved successfully.",

      class: {
        _id: classRecord._id,
        name: classRecord.name,
        arm: classRecord.arm,
        section: classRecord.section,
      },

      subject: {
        _id: subjectRecord._id,
        name: subjectRecord.name,
        code: subjectRecord.code,
      },

      academicSession: {
        _id: sessionRecord._id,
        name: sessionRecord.name,
      },

      academicTerm: {
        _id: termRecord._id,
        name: termRecord.name,
      },

      summary: {
        totalStudents: roster.length,
        studentsWithResults,
        studentsWithoutResults,
      },

      roster,
    });
  } catch (error) {
    console.error("Get teacher roster error:", error);

    return res.status(500).json({
      message: "Server error while retrieving teacher result roster.",
      error: error.message,
    });
  }
};

 // @desc    Submit all teacher results for a class/subject/term
// @route   POST /api/results/teacher-results/submit
// @access  Teacher
export const submitTeacherResults = async (req, res) => {
  try {
    const {
      schoolClass,
      subject,
      academicSession,
      academicTerm,
    } = req.body;

    if (req.user.role !== "teacher") {
      return res.status(403).json({
        message: "Only teachers can submit results.",
      });
    }

    if (!req.user.school) {
      return res.status(403).json({
        message: "Teacher is not associated with a school.",
      });
    }

    if (
      !schoolClass ||
      !subject ||
      !academicSession ||
      !academicTerm
    ) {
      return res.status(400).json({
        message:
          "schoolClass, subject, academicSession, and academicTerm are required.",
      });
    }

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    if (!school.isActive) {
      return res.status(403).json({
        message: "School is inactive.",
      });
    }

    const classRecord = await SchoolClass.findOne({
      _id: schoolClass,
      school: req.user.school,
    });

    if (!classRecord) {
      return res.status(404).json({
        message: "Class not found in your school.",
      });
    }

    const subjectRecord = await Subject.findOne({
      _id: subject,
      school: req.user.school,
    });

    if (!subjectRecord) {
      return res.status(404).json({
        message: "Subject not found in your school.",
      });
    }

    const sessionRecord = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!sessionRecord) {
      return res.status(404).json({
        message: "Academic session not found in your school.",
      });
    }

    const termRecord = await AcademicTerm.findOne({
      _id: academicTerm,
      school: req.user.school,
      academicSession,
    });

    if (!termRecord) {
      return res.status(404).json({
        message: "Academic term not found for this school/session.",
      });
    }

    // Get every active student in the class.
    const students = await Student.find({
      school: req.user.school,
      schoolClass,
      isActive: true,
    }).select("_id studentId firstName middleName lastName");

    if (students.length === 0) {
      return res.status(400).json({
        message: "There are no active students in this class.",
      });
    }

    // Only look at results entered by this teacher.
    const results = await Result.find({
      school: req.user.school,
      enteredBy: req.user._id,
      schoolClass,
      subject,
      academicSession,
      academicTerm,
    }).select(
      "_id student caScore examScore total grade remark status"
    );

    const resultMap = new Map();

    for (const result of results) {
      resultMap.set(String(result.student), result);
    }

    const missingStudents = [];

    for (const student of students) {
      if (!resultMap.has(String(student._id))) {
        missingStudents.push({
          _id: student._id,
          studentId: student.studentId,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
        });
      }
    }

    // Do not allow submission when even one student is missing.
    if (missingStudents.length > 0) {
      return res.status(400).json({
        message:
          "Results cannot be submitted because some students are missing results.",
        summary: {
          totalStudents: students.length,
          resultsEntered: results.length,
          studentsMissingResults: missingStudents.length,
        },
        missingStudents,
      });
    }

    // Make sure none of the teacher's results are already locked.
    const lockedResults = results.filter(
      (result) => result.status === "locked"
    );

    if (lockedResults.length > 0) {
      return res.status(400).json({
        message:
          "Some results are already locked and cannot be submitted again.",
        lockedResults: lockedResults.map((result) => ({
          resultId: result._id,
          student: result.student,
        })),
      });
    }

    // Make sure there are no already published results mixed into
    // an incomplete submission workflow.
    const publishedResults = results.filter(
      (result) => result.status === "published"
    );

    if (publishedResults.length > 0) {
      return res.status(400).json({
        message:
          "Some results have already been published and cannot be submitted again.",
        publishedResults: publishedResults.map((result) => ({
          resultId: result._id,
          student: result.student,
        })),
      });
    }

    // Only draft results should be submitted.
    const nonDraftResults = results.filter(
      (result) => result.status !== "draft"
    );

    if (nonDraftResults.length > 0) {
      return res.status(400).json({
        message:
          "All results must be in draft status before submitting the subject.",
        invalidResults: nonDraftResults.map((result) => ({
          resultId: result._id,
          student: result.student,
          status: result.status,
        })),
      });
    }

    const updateResult = await Result.updateMany(
      {
        school: req.user.school,
        enteredBy: req.user._id,
        schoolClass,
        subject,
        academicSession,
        academicTerm,
        status: "draft",
      },
      {
        $set: {
          status: "pending_review",
        },
      }
    );

    return res.status(200).json({
      message: "Results submitted successfully for review.",
      class: {
        _id: classRecord._id,
        name: classRecord.name,
        arm: classRecord.arm,
        section: classRecord.section,
      },
      subject: {
        _id: subjectRecord._id,
        name: subjectRecord.name,
        code: subjectRecord.code,
      },
      academicSession: {
        _id: sessionRecord._id,
        name: sessionRecord.name,
      },
      academicTerm: {
        _id: termRecord._id,
        name: termRecord.name,
      },
      summary: {
        totalStudents: students.length,
        resultsSubmitted: updateResult.modifiedCount,
        status: "pending_review",
      },
    });
  } catch (error) {
    console.error("Submit teacher results error:", error);

    return res.status(500).json({
      message: "Server error while submitting teacher results.",
      error: error.message,
    });
  }
};