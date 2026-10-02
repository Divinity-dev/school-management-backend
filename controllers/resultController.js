import Result from "../models/Result.js";
import Student from "../models/Student.js";
import SchoolClass from "../models/SchoolClass.js";
import Subject from "../models/Subject.js";
import AcademicSession from "../models/AcademicSession.js";
import AcademicTerm from "../models/AcademicTerm.js";
import SubjectAssignment from "../models/SubjectAssignment.js";
import School from "../models/School.js";

/* =========================================================
   HELPERS
========================================================= */

const verifyTeacherSubjectAssignment = async ({
  teacherId,
  schoolId,
  schoolClass,
  subject,
  academicSession,
}) => {
  return SubjectAssignment.findOne({
    teacher: teacherId,
    school: schoolId,
    schoolClass,
    subject,
    academicSession,
    isActive: true,
  });
};

const getConfiguredGradingSystem = (school) => {
  const gradingSystem = school?.gradingSystem;

  if (!gradingSystem) {
    throw new Error("School grading system has not been configured.");
  }

  const caMaximum = Number(gradingSystem.caMaximum);
  const examMaximum = Number(gradingSystem.examMaximum);
  const totalMaximum = Number(gradingSystem.totalMaximum);

  const caComponents = Array.isArray(gradingSystem.caComponents)
    ? gradingSystem.caComponents.map((component) => ({
        name: String(component.name || "").trim(),
        maximum: Number(component.maximum),
      }))
    : [];

  const gradingScale = Array.isArray(gradingSystem.gradingScale)
    ? gradingSystem.gradingScale.map((rule) => ({
        min: Number(rule.min),
        max: Number(rule.max),
        grade: String(rule.grade || "").trim(),
        remark: String(rule.remark || "").trim(),
      }))
    : [];

  if (
    !Number.isFinite(caMaximum) ||
    !Number.isFinite(examMaximum) ||
    !Number.isFinite(totalMaximum)
  ) {
    throw new Error("School grading system contains invalid maximum scores.");
  }

  if (caMaximum + examMaximum !== totalMaximum) {
    throw new Error(
      "CA maximum and exam maximum must add up to the total maximum."
    );
  }

  if (caComponents.length === 0 && caMaximum > 0) {
    throw new Error("School has no CA assessment components configured.");
  }

  const componentNames = new Set();

  for (const component of caComponents) {
    if (!component.name) {
      throw new Error("Every CA component must have a name.");
    }

    if (!Number.isFinite(component.maximum) || component.maximum < 0) {
      throw new Error(
        `Invalid maximum score for CA component "${component.name}".`
      );
    }

    const normalizedName = component.name.toLowerCase();

    if (componentNames.has(normalizedName)) {
      throw new Error(
        `Duplicate CA component name "${component.name}".`
      );
    }

    componentNames.add(normalizedName);
  }

  const componentTotal = caComponents.reduce(
    (sum, component) => sum + component.maximum,
    0
  );

  if (componentTotal !== caMaximum) {
    throw new Error(
      `CA assessment components total ${componentTotal}, but CA maximum is ${caMaximum}.`
    );
  }

  if (gradingScale.length === 0) {
    throw new Error("School grading scale has not been configured.");
  }

  for (const rule of gradingScale) {
    if (
      !Number.isFinite(rule.min) ||
      !Number.isFinite(rule.max) ||
      !rule.grade ||
      !rule.remark
    ) {
      throw new Error("School grading scale contains invalid rules.");
    }

    if (rule.min > rule.max) {
      throw new Error(
        `Invalid grading rule for grade "${rule.grade}".`
      );
    }
  }

  return {
    caMaximum,
    examMaximum,
    totalMaximum,
    caComponents,
    gradingScale,
  };
};

const buildGradingSystemSnapshot = (gradingSystem) => ({
  caMaximum: gradingSystem.caMaximum,
  examMaximum: gradingSystem.examMaximum,
  totalMaximum: gradingSystem.totalMaximum,

  caComponents: gradingSystem.caComponents.map((component) => ({
    name: component.name,
    maximum: component.maximum,
  })),

  gradingScale: gradingSystem.gradingScale.map((rule) => ({
    min: rule.min,
    max: rule.max,
    grade: rule.grade,
    remark: rule.remark,
  })),
});

const calculateResultScores = ({
  assessmentScores,
  examScore,
  gradingSystem,
}) => {
  if (!Array.isArray(assessmentScores)) {
    return {
      error: "assessmentScores must be an array.",
    };
  }

  const configuredComponents = gradingSystem.caComponents;

  if (assessmentScores.length !== configuredComponents.length) {
    return {
      error:
        "All configured CA assessment components must have a score.",
    };
  }

  const submittedMap = new Map();

  for (const assessment of assessmentScores) {
    if (!assessment || !assessment.name) {
      return {
        error: "Every CA assessment score must have a component name.",
      };
    }

    const normalizedName = String(assessment.name)
      .trim()
      .toLowerCase();

    if (submittedMap.has(normalizedName)) {
      return {
        error: `Duplicate CA assessment component "${assessment.name}".`,
      };
    }

    submittedMap.set(normalizedName, assessment.score);
  }

  const normalizedAssessmentScores = [];

  for (const component of configuredComponents) {
    const normalizedName = component.name.toLowerCase();

    if (!submittedMap.has(normalizedName)) {
      return {
        error: `Score for "${component.name}" is required.`,
      };
    }

    const score = Number(submittedMap.get(normalizedName));

    if (!Number.isFinite(score)) {
      return {
        error: `Score for "${component.name}" must be a valid number.`,
      };
    }

    if (score < 0 || score > component.maximum) {
      return {
        error: `"${component.name}" score must be between 0 and ${component.maximum}.`,
      };
    }

    normalizedAssessmentScores.push({
      name: component.name,
      score,
      maximum: component.maximum,
    });
  }

  const numericExamScore = Number(examScore);

  if (!Number.isFinite(numericExamScore)) {
    return {
      error: "Exam score must be a valid number.",
    };
  }

  if (
    numericExamScore < 0 ||
    numericExamScore > gradingSystem.examMaximum
  ) {
    return {
      error: `Exam score must be between 0 and ${gradingSystem.examMaximum}.`,
    };
  }

  const caScore = normalizedAssessmentScores.reduce(
    (sum, assessment) => sum + assessment.score,
    0
  );

  const total = caScore + numericExamScore;

  if (total > gradingSystem.totalMaximum) {
    return {
      error: `Total score cannot exceed ${gradingSystem.totalMaximum}.`,
    };
  }

  const gradingRule = gradingSystem.gradingScale.find(
    (rule) => total >= rule.min && total <= rule.max
  );

  if (!gradingRule) {
    return {
      error: `No grading rule exists for total score ${total}.`,
    };
  }

  return {
    assessmentScores: normalizedAssessmentScores,
    caScore,
    examScore: numericExamScore,
    total,
    grade: gradingRule.grade,
    remark: gradingRule.remark,
  };
};

/* =========================================================
   CREATE RESULT
========================================================= */

export const createResult = async (req, res) => {
  try {
    const {
      student,
      schoolClass,
      subject,
      academicSession,
      academicTerm,
      assessmentScores,
      examScore,
    } = req.body;

    if (
      !student ||
      !schoolClass ||
      !subject ||
      !academicSession ||
      !academicTerm
    ) {
      return res.status(400).json({
        message:
          "Student, class, subject, academic session and academic term are required.",
      });
    }

    const studentRecord = await Student.findOne({
      _id: student,
      school: req.user.school,
      isActive: true,
    });

    if (!studentRecord) {
      return res.status(404).json({
        message: "Student not found.",
      });
    }

    const schoolClassRecord = await SchoolClass.findOne({
      _id: schoolClass,
      school: req.user.school,
      isActive: true,
    });

    if (!schoolClassRecord) {
      return res.status(404).json({
        message: "Class not found.",
      });
    }

    const subjectRecord = await Subject.findOne({
      _id: subject,
      school: req.user.school,
      isActive: true,
    });

    if (!subjectRecord) {
      return res.status(404).json({
        message: "Subject not found.",
      });
    }

    const sessionRecord = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!sessionRecord) {
      return res.status(404).json({
        message: "Academic session not found.",
      });
    }

    const termRecord = await AcademicTerm.findOne({
      _id: academicTerm,
      school: req.user.school,
    });

    if (!termRecord) {
      return res.status(404).json({
        message: "Academic term not found.",
      });
    }

    const assignment = await verifyTeacherSubjectAssignment({
      teacherId: req.user._id,
      schoolId: req.user.school,
      schoolClass,
      subject,
      academicSession,
    });

    if (!assignment) {
      return res.status(403).json({
        message:
          "You are not assigned to teach this subject for this class and academic session.",
      });
    }

    const existingResult = await Result.findOne({
      school: req.user.school,
      student,
      subject,
      academicSession,
      academicTerm,
    });

    if (existingResult) {
      return res.status(409).json({
        message: "A result already exists for this student and subject.",
      });
    }

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    const gradingSystem = getConfiguredGradingSystem(school);

    const calculated = calculateResultScores({
      assessmentScores,
      examScore,
      gradingSystem,
    });

    if (calculated.error) {
      return res.status(400).json({
        message: calculated.error,
      });
    }

    const result = await Result.create({
      school: req.user.school,
      student,
      schoolClass,
      subject,
      academicSession,
      academicTerm,

      assessmentScores: calculated.assessmentScores,

      caScore: calculated.caScore,
      examScore: calculated.examScore,
      total: calculated.total,
      grade: calculated.grade,
      remark: calculated.remark,

      gradingSystem: buildGradingSystemSnapshot(gradingSystem),

      status: "draft",
      enteredBy: req.user._id,
    });

    return res.status(201).json({
      message: "Result created successfully.",
      result,
    });
  } catch (error) {
    console.error("Create result error:", error);

    return res.status(500).json({
      message: error.message || "Failed to create result.",
    });
  }
};

/* =========================================================
   UPDATE RESULT
========================================================= */

export const updateResult = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      assessmentScores,
      examScore,
    } = req.body;

    const result = await Result.findOne({
      _id: id,
      school: req.user.school,
    });

    if (!result) {
      return res.status(404).json({
        message: "Result not found.",
      });
    }

    if (result.status !== "draft") {
      return res.status(400).json({
        message: "Only draft results can be updated.",
      });
    }

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    const gradingSystem = getConfiguredGradingSystem(school);

    const calculated = calculateResultScores({
      assessmentScores,
      examScore,
      gradingSystem,
    });

    if (calculated.error) {
      return res.status(400).json({
        message: calculated.error,
      });
    }

    result.assessmentScores = calculated.assessmentScores;

    result.caScore = calculated.caScore;
    result.examScore = calculated.examScore;
    result.total = calculated.total;
    result.grade = calculated.grade;
    result.remark = calculated.remark;

    result.gradingSystem =
      buildGradingSystemSnapshot(gradingSystem);

    await result.save();

    return res.status(200).json({
      message: "Result updated successfully.",
      result,
    });
  } catch (error) {
    console.error("Update result error:", error);

    return res.status(500).json({
      message: error.message || "Failed to update result.",
    });
  }
};

/* =========================================================
   SUBMIT RESULT FOR REVIEW
========================================================= */

export const submitResultForReview = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Result.findOne({
      _id: id,
      school: req.user.school,
    });

    if (!result) {
      return res.status(404).json({
        message: "Result not found.",
      });
    }

    if (result.status !== "draft") {
      return res.status(400).json({
        message: "Only draft results can be submitted for review.",
      });
    }

    result.status = "pending_review";

    await result.save();

    return res.status(200).json({
      message: "Result submitted for review.",
      result,
    });
  } catch (error) {
    console.error("Submit result for review error:", error);

    return res.status(500).json({
      message: error.message || "Failed to submit result for review.",
    });
  }
};

/* =========================================================
   PUBLISH RESULT
========================================================= */

export const publishResult = async (req, res) => {
  try {
    const { id } = req.params;

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
        message:
          "Only results pending review can be published.",
      });
    }

    result.status = "published";
    result.publishedAt = new Date();

    await result.save();

    return res.status(200).json({
      message: "Result published successfully.",
      result,
    });
  } catch (error) {
    console.error("Publish result error:", error);

    return res.status(500).json({
      message: error.message || "Failed to publish result.",
    });
  }
};

/* =========================================================
   REJECT RESULT
========================================================= */

export const rejectResult = async (req, res) => {
  try {
    const { id } = req.params;

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
        message:
          "Only results pending review can be rejected.",
      });
    }

    result.status = "draft";

    await result.save();

    return res.status(200).json({
      message: "Result rejected and returned to draft.",
      result,
    });
  } catch (error) {
    console.error("Reject result error:", error);

    return res.status(500).json({
      message: error.message || "Failed to reject result.",
    });
  }
};

/* =========================================================
   LOCK RESULT
========================================================= */

export const lockResult = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Result.findOne({
      _id: id,
      school: req.user.school,
    });

    if (!result) {
      return res.status(404).json({
        message: "Result not found.",
      });
    }

    if (result.status !== "published") {
      return res.status(400).json({
        message: "Only published results can be locked.",
      });
    }

    result.status = "locked";
    result.lockedAt = new Date();

    await result.save();

    return res.status(200).json({
      message: "Result locked successfully.",
      result,
    });
  } catch (error) {
    console.error("Lock result error:", error);

    return res.status(500).json({
      message: error.message || "Failed to lock result.",
    });
  }
};

/* =========================================================
   GET MY RESULTS
========================================================= */

export const getMyResults = async (req, res) => {
  try {
    const student = await Student.findOne({
      user: req.user._id,
      school: req.user.school,
      isActive: true,
    }).populate("user", "firstName lastName email");

    if (!student) {
      return res.status(404).json({
        message: "Student profile not found.",
      });
    }

    const results = await Result.find({
      school: req.user.school,
      student: student._id,
      status: {
        $in: ["published", "locked"],
      },
    })
      .populate("subject", "name code")
      .populate("schoolClass", "name")
      .populate("academicSession", "name")
      .populate("academicTerm", "name")
      .sort({
        academicSession: -1,
        academicTerm: -1,
        subject: 1,
      });

    return res.status(200).json({
      student: {
        _id: student._id,
        studentId: student.studentId,
        admissionNumber: student.admissionNumber,
        firstName: student.user?.firstName || "",
        lastName: student.user?.lastName || "",
      },
      results,
    });
  } catch (error) {
    console.error("Get my results error:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch results.",
    });
  }
};

/* =========================================================
   GET CLASS AVERAGES
========================================================= */

export const getClassAverages = async (req, res) => {
  try {
    const {
      schoolClass,
      subject,
      academicSession,
      academicTerm,
    } = req.query;

    const filter = {
      school: req.user.school,
      status: {
        $in: ["published", "locked"],
      },
    };

    if (schoolClass) filter.schoolClass = schoolClass;
    if (subject) filter.subject = subject;
    if (academicSession) filter.academicSession = academicSession;
    if (academicTerm) filter.academicTerm = academicTerm;

    const averages = await Result.aggregate([
      {
        $match: filter,
      },
      {
        $group: {
          _id: {
            schoolClass: "$schoolClass",
            subject: "$subject",
          },
          average: {
            $avg: "$total",
          },
          highest: {
            $max: "$total",
          },
          lowest: {
            $min: "$total",
          },
          count: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          "_id.schoolClass": 1,
          "_id.subject": 1,
        },
      },
    ]);

    return res.status(200).json({
      averages,
    });
  } catch (error) {
    console.error("Get class averages error:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch class averages.",
    });
  }
};

/* =========================================================
   GET CLASS RANKING
========================================================= */

export const getClassRanking = async (req, res) => {
  try {
    const {
      schoolClass,
      academicSession,
      academicTerm,
    } = req.query;

    if (!schoolClass || !academicSession || !academicTerm) {
      return res.status(400).json({
        message:
          "schoolClass, academicSession and academicTerm are required.",
      });
    }

    const rankings = await Result.aggregate([
      {
        $match: {
          school: req.user.school,
          schoolClass,
          academicSession,
          academicTerm,
          status: {
            $in: ["published", "locked"],
          },
        },
      },
      {
        $group: {
          _id: "$student",
          totalScore: {
            $sum: "$total",
          },
          subjectCount: {
            $sum: 1,
          },
        },
      },
      {
        $project: {
          student: "$_id",
          totalScore: 1,
          subjectCount: 1,
          averageScore: {
            $divide: ["$totalScore", "$subjectCount"],
          },
        },
      },
      {
        $sort: {
          averageScore: -1,
          totalScore: -1,
        },
      },
    ]);

    const ranked = rankings.map((item, index) => ({
      rank: index + 1,
      ...item,
    }));

    return res.status(200).json({
      rankings: ranked,
    });
  } catch (error) {
    console.error("Get class ranking error:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch class ranking.",
    });
  }
};

/* =========================================================
   GET STUDENT REPORT
========================================================= */

export const getStudentReport = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({
      _id: studentId,
      school: req.user.school,
      isActive: true,
    }).populate("user", "firstName lastName email");

    if (!student) {
      return res.status(404).json({
        message: "Student not found.",
      });
    }

    const results = await Result.find({
      school: req.user.school,
      student: studentId,
      status: {
        $in: ["published", "locked"],
      },
    })
      .populate("subject", "name code")
      .populate("schoolClass", "name")
      .populate("academicSession", "name")
      .populate("academicTerm", "name")
      .sort({
        academicSession: -1,
        academicTerm: -1,
        subject: 1,
      });

    const subjects = results.map((result) => ({
      resultId: result._id,

      subject: result.subject,

      assessmentScores: result.assessmentScores,

      caScore: result.caScore,
      examScore: result.examScore,
      total: result.total,

      grade: result.grade,
      remark: result.remark,

      gradingSystem: result.gradingSystem,

      status: result.status,
    }));

    const totalScore = results.reduce(
      (sum, result) => sum + result.total,
      0
    );

    const averageScore =
      results.length > 0
        ? totalScore / results.length
        : 0;

    const school = await School.findById(req.user.school);

    let overallGrade = null;
    let overallRemark = null;

    if (school?.gradingSystem?.gradingScale?.length) {
      const gradingRule = school.gradingSystem.gradingScale.find(
        (rule) =>
          averageScore >= Number(rule.min) &&
          averageScore <= Number(rule.max)
      );

      if (gradingRule) {
        overallGrade = gradingRule.grade;
        overallRemark = gradingRule.remark;
      }
    }

    return res.status(200).json({
      student,
      subjects,
      summary: {
        totalSubjects: results.length,
        totalScore,
        averageScore,
        overallGrade,
        overallRemark,
      },
    });
  } catch (error) {
    console.error("Get student report error:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch student report.",
    });
  }
};

/* =========================================================
   GET TEACHER RESULTS
========================================================= */

export const getTeacherResults = async (req, res) => {
  try {
    const {
      schoolClass,
      subject,
      academicSession,
      academicTerm,
    } = req.query;

    const filter = {
      school: req.user.school,
      enteredBy: req.user._id,
    };

    if (schoolClass) filter.schoolClass = schoolClass;
    if (subject) filter.subject = subject;
    if (academicSession) filter.academicSession = academicSession;
    if (academicTerm) filter.academicTerm = academicTerm;

    const results = await Result.find(filter)
      .populate("student", "studentId admissionNumber")
      .populate("schoolClass", "name")
      .populate("subject", "name code")
      .populate("academicSession", "name")
      .populate("academicTerm", "name")
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      results,
    });
  } catch (error) {
    console.error("Get teacher results error:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch teacher results.",
    });
  }
};

/* =========================================================
   GET TEACHER ROSTER
========================================================= */

export const getTeacherRoster = async (req, res) => {
  try {
    const {
      schoolClass,
      subject,
      academicSession,
      academicTerm,
    } = req.query;

    if (
      !schoolClass ||
      !subject ||
      !academicSession ||
      !academicTerm
    ) {
      return res.status(400).json({
        message:
          "schoolClass, subject, academicSession and academicTerm are required.",
      });
    }

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    const gradingSystem = getConfiguredGradingSystem(school);

    const assignment = await verifyTeacherSubjectAssignment({
      teacherId: req.user._id,
      schoolId: req.user.school,
      schoolClass,
      subject,
      academicSession,
    });

    if (!assignment) {
      return res.status(403).json({
        message:
          "You are not assigned to this subject for this class and academic session.",
      });
    }

    const students = await Student.find({
      school: req.user.school,
      schoolClass,
      isActive: true,
    })
      .populate("user", "firstName lastName email")
      .sort({
        "user.firstName": 1,
        "user.lastName": 1,
      });

    const studentIds = students.map((student) => student._id);

    const results = await Result.find({
      school: req.user.school,
      student: {
        $in: studentIds,
      },
      schoolClass,
      subject,
      academicSession,
      academicTerm,
    }).select(
      "_id student assessmentScores caScore examScore total grade remark status"
    );

    const resultMap = new Map(
      results.map((result) => [
        result.student.toString(),
        result,
      ])
    );

    const roster = students.map((student) => {
      const result = resultMap.get(student._id.toString());

      return {
        student: {
          _id: student._id,
          studentId: student.studentId,
          admissionNumber: student.admissionNumber,
          firstName: student.user?.firstName || "",
          lastName: student.user?.lastName || "",
          email: student.user?.email || "",
        },

        result: result
          ? {
              _id: result._id,
              assessmentScores: result.assessmentScores,
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

    return res.status(200).json({
      gradingSystem: {
        caMaximum: gradingSystem.caMaximum,
        examMaximum: gradingSystem.examMaximum,
        totalMaximum: gradingSystem.totalMaximum,

        caComponents: gradingSystem.caComponents,

        gradingScale: gradingSystem.gradingScale,
      },

      roster,
    });
  } catch (error) {
    console.error("Get teacher roster error:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch teacher roster.",
    });
  }
};

/* =========================================================
   SUBMIT TEACHER RESULTS
========================================================= */

export const submitTeacherResults = async (req, res) => {
  try {
    const {
      schoolClass,
      subject,
      academicSession,
      academicTerm,
      results,
    } = req.body;

    if (
      !schoolClass ||
      !subject ||
      !academicSession ||
      !academicTerm
    ) {
      return res.status(400).json({
        message:
          "schoolClass, subject, academicSession and academicTerm are required.",
      });
    }

    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({
        message: "Results must be a non-empty array.",
      });
    }

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    const gradingSystem = getConfiguredGradingSystem(school);

    const assignment = await verifyTeacherSubjectAssignment({
      teacherId: req.user._id,
      schoolId: req.user.school,
      schoolClass,
      subject,
      academicSession,
    });

    if (!assignment) {
      return res.status(403).json({
        message:
          "You are not assigned to this subject for this class and academic session.",
      });
    }

    const sessionRecord = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!sessionRecord) {
      return res.status(404).json({
        message: "Academic session not found.",
      });
    }

    const termRecord = await AcademicTerm.findOne({
      _id: academicTerm,
      school: req.user.school,
    });

    if (!termRecord) {
      return res.status(404).json({
        message: "Academic term not found.",
      });
    }

    const studentIds = results.map((item) => item.student);

    const students = await Student.find({
      _id: {
        $in: studentIds,
      },
      school: req.user.school,
      schoolClass,
      isActive: true,
    });

    if (students.length !== studentIds.length) {
      return res.status(400).json({
        message:
          "One or more students do not belong to this class.",
      });
    }

    const existingResults = await Result.find({
      school: req.user.school,
      student: {
        $in: studentIds,
      },
      subject,
      academicSession,
      academicTerm,
    }).select(
      "_id student assessmentScores caScore examScore total grade remark status"
    );

    const existingResultMap = new Map(
      existingResults.map((result) => [
        result.student.toString(),
        result,
      ])
    );

    const createdResults = [];
    const updatedResults = [];

    for (const item of results) {
      if (!item.student) {
        return res.status(400).json({
          message: "Every result must contain a student.",
        });
      }

      const calculated = calculateResultScores({
        assessmentScores: item.assessmentScores,
        examScore: item.examScore,
        gradingSystem,
      });

      if (calculated.error) {
        return res.status(400).json({
          message: `Student ${item.student}: ${calculated.error}`,
        });
      }

      const existingResult = existingResultMap.get(
        item.student.toString()
      );

      if (existingResult) {
        if (existingResult.status !== "draft") {
          return res.status(400).json({
            message:
              "Only draft results can be updated.",
          });
        }

        existingResult.assessmentScores =
          calculated.assessmentScores;

        existingResult.caScore = calculated.caScore;
        existingResult.examScore = calculated.examScore;
        existingResult.total = calculated.total;
        existingResult.grade = calculated.grade;
        existingResult.remark = calculated.remark;

        existingResult.gradingSystem =
          buildGradingSystemSnapshot(gradingSystem);

        await existingResult.save();

        updatedResults.push(existingResult);
      } else {
        const newResult = await Result.create({
          school: req.user.school,
          student: item.student,
          schoolClass,
          subject,
          academicSession,
          academicTerm,

          assessmentScores:
            calculated.assessmentScores,

          caScore: calculated.caScore,
          examScore: calculated.examScore,
          total: calculated.total,
          grade: calculated.grade,
          remark: calculated.remark,

          gradingSystem:
            buildGradingSystemSnapshot(gradingSystem),

          status: "draft",
          enteredBy: req.user._id,
        });

        createdResults.push(newResult);
      }
    }

    return res.status(200).json({
      message: "Teacher results saved successfully.",
      created: createdResults,
      updated: updatedResults,
    });
  } catch (error) {
    console.error("Submit teacher results error:", error);

    return res.status(500).json({
      message:
        error.message || "Failed to save teacher results.",
    });
  }
};

/* =========================================================
   GET ADMIN RESULTS
========================================================= */

export const getAdminResults = async (req, res) => {
  try {
    const {
      schoolClass,
      subject,
      academicSession,
      academicTerm,
      status,
    } = req.query;

    const filter = {
      school: req.user.school,
    };

    if (schoolClass) filter.schoolClass = schoolClass;
    if (subject) filter.subject = subject;
    if (academicSession) {
      filter.academicSession = academicSession;
    }
    if (academicTerm) {
      filter.academicTerm = academicTerm;
    }
    if (status) filter.status = status;

    const results = await Result.find(filter)
      .populate(
        "student",
        "studentId admissionNumber user"
      )
      .populate("schoolClass", "name")
      .populate("subject", "name code")
      .populate("academicSession", "name")
      .populate("academicTerm", "name")
      .populate(
        "enteredBy",
        "firstName lastName email"
      )
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      results,
    });
  } catch (error) {
    console.error("Get admin results error:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch results.",
    });
  }
};