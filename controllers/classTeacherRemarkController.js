import mongoose from "mongoose";

import ClassTeacherRemark from "../models/ClassTeacherRemark.js";
import SchoolClass from "../models/SchoolClass.js";
import Student from "../models/Student.js";
import AcademicSession from "../models/AcademicSession.js";
import AcademicTerm from "../models/AcademicTerm.js";
import Attendance from "../models/Attendance.js";
import Result from "../models/Result.js";

const MAX_REMARK_LENGTH = 1000;

const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "excused",
];

const emptyAttendance = () => ({
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
  total: 0,
  attendancePercentage: 0,
});

const normalizeAttendanceOverride = (value) => ({
  enabled: value?.enabled === true,
  present: Number(value?.present ?? 0),
  absent: Number(value?.absent ?? 0),
  late: Number(value?.late ?? 0),
  excused: Number(value?.excused ?? 0),
});

const isValidAttendanceOverride = (value) => {
  if (!value || typeof value.enabled !== "boolean") {
    return false;
  }

  return ["present", "absent", "late", "excused"].every(
    (key) =>
      Number.isInteger(value[key]) &&
      value[key] >= 0 &&
      value[key] <= 10000
  );
};

const calculateAttendance = (attendance) => {
  const total =
    attendance.present +
    attendance.absent +
    attendance.late +
    attendance.excused;

  return {
    ...attendance,
    total,
    attendancePercentage:
      total > 0
        ? Number(((attendance.present / total) * 100).toFixed(1))
        : 0,
  };
};

const getAssignedClass = async ({
  schoolClassId,
  teacherId,
  schoolId,
  academicSessionId,
}) => {
  const schoolClass = await SchoolClass.findOne({
    _id: schoolClassId,
    school: schoolId,
    classTeacher: teacherId,
    isActive: true,
  });

  if (!schoolClass) {
    return {
      error: "Class not found or you are not its assigned class teacher.",
      status: 403,
    };
  }

  if (
    academicSessionId &&
    schoolClass.academicSession?.toString() !==
      academicSessionId.toString()
  ) {
    return {
      error: "The selected academic session does not match this class.",
      status: 400,
    };
  }

  return { schoolClass };
};

const validateAcademicPeriod = async ({
  schoolId,
  academicSessionId,
  academicTermId,
}) => {
  if (
    !mongoose.isValidObjectId(academicSessionId) ||
    !mongoose.isValidObjectId(academicTermId)
  ) {
    return {
      error: "A valid academic session and term are required.",
      status: 400,
    };
  }

  const [session, term] = await Promise.all([
    AcademicSession.findOne({
      _id: academicSessionId,
      school: schoolId,
    }),
    AcademicTerm.findOne({
      _id: academicTermId,
      school: schoolId,
    }),
  ]);

  if (!session) {
    return {
      error: "Academic session not found.",
      status: 404,
    };
  }

  if (!term) {
    return {
      error: "Academic term not found.",
      status: 404,
    };
  }

  if (
    !term.academicSession ||
    term.academicSession.toString() !== academicSessionId.toString()
  ) {
    return {
      error: "The selected academic term does not belong to this session.",
      status: 400,
    };
  }

  return { session, term };
};

const checkRemarksLock = async ({
  schoolId,
  schoolClassId,
  academicSessionId,
  academicTermId,
}) => {
  const lockedResult = await Result.findOne({
    school: schoolId,
    schoolClass: schoolClassId,
    academicSession: academicSessionId,
    academicTerm: academicTermId,
    status: "locked",
  })
    .select("_id")
    .lean();

  return { isLocked: Boolean(lockedResult) };
};

const validateRemarkRequest = async ({
  schoolClassId,
  teacherId,
  schoolId,
  academicSessionId,
  academicTermId,
}) => {
  if (
    !mongoose.isValidObjectId(schoolClassId) ||
    !mongoose.isValidObjectId(academicSessionId) ||
    !mongoose.isValidObjectId(academicTermId)
  ) {
    return {
      error: "Valid class, academic session and academic term IDs are required.",
      status: 400,
    };
  }

  const assignment = await getAssignedClass({
    schoolClassId,
    teacherId,
    schoolId,
    academicSessionId,
  });

  if (assignment.error) return assignment;

  const period = await validateAcademicPeriod({
    schoolId,
    academicSessionId,
    academicTermId,
  });

  if (period.error) return period;

  return {
    schoolClass: assignment.schoolClass,
    session: period.session,
    term: period.term,
  };
};

/* GET /api/class-teacher-remarks/class */
export const getClassTeacherRemarks = async (req, res) => {
  try {
    const { schoolClass, academicSession, academicTerm } = req.query;

    if (!schoolClass || !academicSession || !academicTerm) {
      return res.status(400).json({
        message: "Class, academic session and academic term are required.",
      });
    }

    const validation = await validateRemarkRequest({
      schoolClassId: schoolClass,
      teacherId: req.user._id,
      schoolId: req.user.school,
      academicSessionId: academicSession,
      academicTermId: academicTerm,
    });

    if (validation.error) {
      return res.status(validation.status).json({
        message: validation.error,
      });
    }

    const { schoolClass: classRecord, session, term } = validation;

    const [students, remarks, lockStatus] = await Promise.all([
      Student.find({
        school: req.user.school,
        schoolClass,
        isActive: true,
      })
        .select(
  "_id studentId admissionNumber firstName middleName lastName name fullName user schoolClass"
)
.populate("user", "firstName middleName lastName name")
        .sort({ createdAt: 1 })
        .lean(),

      ClassTeacherRemark.find({
        school: req.user.school,
        schoolClass,
        academicSession,
        academicTerm,
      }).lean(),

      checkRemarksLock({
        schoolId: req.user.school,
        schoolClassId: schoolClass,
        academicSessionId: academicSession,
        academicTermId: academicTerm,
      }),
    ]);

    const studentIds = students.map((student) => student._id);

    const [attendanceRecords, results] = await Promise.all([
      Attendance.find({
        school: req.user.school,
        class: schoolClass,
        term: academicTerm,
        student: { $in: studentIds },
      })
        .select("student status")
        .lean(),

      Result.find({
        school: req.user.school,
        schoolClass,
        academicSession,
        academicTerm,
        student: { $in: studentIds },
        status: { $in: ["published", "locked"] },
      })
        .populate("subject", "name code")
        .select(
          "student subject assessmentScores caScore examScore total grade remark status"
        )
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const remarkMap = new Map(
      remarks.map((item) => [item.student.toString(), item])
    );

    const attendanceMap = new Map();
    const resultsMap = new Map();

    for (const student of students) {
      attendanceMap.set(student._id.toString(), emptyAttendance());
      resultsMap.set(student._id.toString(), []);
    }

    for (const record of attendanceRecords) {
      const studentKey = record.student.toString();
      const summary = attendanceMap.get(studentKey);

      if (summary && ATTENDANCE_STATUSES.includes(record.status)) {
        summary[record.status] += 1;
      }
    }

    for (const summary of attendanceMap.values()) {
      Object.assign(summary, calculateAttendance(summary));
    }

    for (const result of results) {
      const studentKey = result.student.toString();
      const studentResults = resultsMap.get(studentKey);

      if (!studentResults) continue;

      studentResults.push({
        _id: result._id,
        subject: {
          _id: result.subject?._id || null,
          name: result.subject?.name || "Unnamed subject",
          code: result.subject?.code || "",
        },
        assessmentScores: result.assessmentScores || [],
        caScore: result.caScore,
        examScore: result.examScore,
        total: result.total,
        grade: result.grade,
        remark: result.remark,
        status: result.status,
      });
    }

    
const roster = students.map((student) => {
  const studentKey = student._id.toString();
  const savedRemark = remarkMap.get(studentKey);

  // Student names may be stored directly on Student or on its linked User.
  const user =
    student.user && typeof student.user === "object"
      ? student.user
      : {};

  const firstName =
    student.firstName ||
    student.first_name ||
    user.firstName ||
    user.first_name ||
    "";

  const middleName =
    student.middleName ||
    student.middle_name ||
    student.otherNames ||
    user.middleName ||
    user.middle_name ||
    user.otherNames ||
    "";

  const lastName =
    student.lastName ||
    student.last_name ||
    student.surname ||
    user.lastName ||
    user.last_name ||
    user.surname ||
    "";

  const fullName =
    student.fullName ||
    student.full_name ||
    student.name ||
    user.fullName ||
    user.full_name ||
    user.name ||
    [firstName, middleName, lastName]
      .filter((part) => typeof part === "string" && part.trim())
      .map((part) => part.trim())
      .join(" ");

  return {
    student: {
      _id: student._id,
      studentId: student.studentId || "",
      admissionNumber: student.admissionNumber || "",
      firstName,
      middleName,
      lastName,
      fullName,
      name: fullName,
    },
    remark: savedRemark?.remark || "",
    remarkId: savedRemark?._id || null,
    updatedAt: savedRemark?.updatedAt || null,
    submittedAt: savedRemark?.submittedAt || null,
    attendanceOverride: normalizeAttendanceOverride(
      savedRemark?.attendanceOverride
    ),
    onlineAttendance:
      attendanceMap.get(studentKey) || emptyAttendance(),
    results: resultsMap.get(studentKey) || [],
  };
});


    const isSubmitted =
      roster.length > 0 &&
      roster.every((item) => Boolean(item.submittedAt));

    return res.status(200).json({
      schoolClass: {
        _id: classRecord._id,
        name: classRecord.name,
        arm: classRecord.arm || "",
      },
      academicSession: {
        _id: session._id,
        name: session.name,
      },
      academicTerm: {
        _id: term._id,
        name: term.name,
      },
      isSubmitted,
      isLocked: lockStatus.isLocked,
      canEdit: !lockStatus.isLocked,
      roster,
    });
  } catch (error) {
    console.error("Get class teacher remarks error:", error);

    return res.status(500).json({
      message: "Failed to fetch class teacher remarks.",
    });
  }
};

/* PUT /api/class-teacher-remarks/class/:schoolClass */
export const saveClassTeacherRemarks = async (req, res) => {
  try {
    const { schoolClass } = req.params;
    const { academicSession, academicTerm, remarks } = req.body;

    if (
      !mongoose.isValidObjectId(schoolClass) ||
      !mongoose.isValidObjectId(academicSession) ||
      !mongoose.isValidObjectId(academicTerm)
    ) {
      return res.status(400).json({
        message:
          "Valid class, academic session and academic term IDs are required.",
      });
    }

    if (!Array.isArray(remarks) || remarks.length === 0) {
      return res.status(400).json({
        message: "Provide at least one student remark.",
      });
    }

    const validation = await validateRemarkRequest({
      schoolClassId: schoolClass,
      teacherId: req.user._id,
      schoolId: req.user.school,
      academicSessionId: academicSession,
      academicTermId: academicTerm,
    });

    if (validation.error) {
      return res.status(validation.status).json({
        message: validation.error,
      });
    }

    const lockStatus = await checkRemarksLock({
      schoolId: req.user.school,
      schoolClassId: schoolClass,
      academicSessionId: academicSession,
      academicTermId: academicTerm,
    });

    if (lockStatus.isLocked) {
      return res.status(403).json({
        message:
          "These results have been locked by the school admin. Class teacher remarks can no longer be edited.",
        isLocked: true,
      });
    }

    const seenStudentIds = new Set();

    for (const item of remarks) {
      if (!item?.student || !mongoose.isValidObjectId(item.student)) {
        return res.status(400).json({
          message: "Every remark must contain a valid student ID.",
        });
      }

      if (typeof item.remark !== "string") {
        return res.status(400).json({
          message: "Every remark must be a text value.",
        });
      }

      if (item.remark.trim().length > MAX_REMARK_LENGTH) {
        return res.status(400).json({
          message: `Remarks cannot exceed ${MAX_REMARK_LENGTH} characters.`,
        });
      }

      const studentKey = item.student.toString();

      if (seenStudentIds.has(studentKey)) {
        return res.status(400).json({
          message: "Duplicate student IDs were provided.",
        });
      }

      seenStudentIds.add(studentKey);

      if (
        Object.prototype.hasOwnProperty.call(item, "attendanceOverride") &&
        !isValidAttendanceOverride(item.attendanceOverride)
      ) {
        return res.status(400).json({
          message:
            "Attendance override counts must be non-negative whole numbers.",
        });
      }
    }

    const studentIds = [...seenStudentIds];

    const students = await Student.find({
      _id: { $in: studentIds },
      school: req.user.school,
      schoolClass,
      isActive: true,
    }).select("_id");

    if (students.length !== studentIds.length) {
      return res.status(400).json({
        message:
          "One or more students do not belong to this class or are inactive.",
      });
    }

    const operations = remarks.map((item) => {
      const setFields = {
        remark: item.remark.trim(),
        updatedBy: req.user._id,
        submittedAt: null,
      };

      // Omitted overrides are left untouched for backwards compatibility.
      if (
        Object.prototype.hasOwnProperty.call(item, "attendanceOverride")
      ) {
        setFields.attendanceOverride = normalizeAttendanceOverride(
          item.attendanceOverride
        );
      }

      return {
        updateOne: {
          filter: {
            school: req.user.school,
            student: item.student,
            schoolClass,
            academicSession,
            academicTerm,
          },
          update: {
            $set: setFields,
            $setOnInsert: {
              school: req.user.school,
              student: item.student,
              schoolClass,
              academicSession,
              academicTerm,
              enteredBy: req.user._id,
            },
          },
          upsert: true,
        },
      };
    });

    await ClassTeacherRemark.bulkWrite(operations, { ordered: true });

    return res.status(200).json({
      message:
        "Class teacher remarks and attendance settings saved successfully. Edited remarks must be resubmitted.",
      count: remarks.length,
      isSubmitted: false,
      isLocked: false,
      canEdit: true,
    });
  } catch (error) {
    console.error("Save class teacher remarks error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "A remark already exists for one of these students. Please reload the class and try again.",
      });
    }

    return res.status(500).json({
      message: "Failed to save class teacher remarks.",
    });
  }
};

/* PUT /api/class-teacher-remarks/class/:schoolClass/submit */
export const submitClassTeacherRemarks = async (req, res) => {
  try {
    const { schoolClass } = req.params;
    const { academicSession, academicTerm } = req.body;

    const validation = await validateRemarkRequest({
      schoolClassId: schoolClass,
      teacherId: req.user._id,
      schoolId: req.user.school,
      academicSessionId: academicSession,
      academicTermId: academicTerm,
    });

    if (validation.error) {
      return res.status(validation.status).json({
        message: validation.error,
      });
    }

    const lockStatus = await checkRemarksLock({
      schoolId: req.user.school,
      schoolClassId: schoolClass,
      academicSessionId: academicSession,
      academicTermId: academicTerm,
    });

    if (lockStatus.isLocked) {
      return res.status(403).json({
        message:
          "These results have been locked by the school admin. Class teacher remarks can no longer be edited or submitted.",
        isLocked: true,
      });
    }

    const students = await Student.find({
      school: req.user.school,
      schoolClass,
      isActive: true,
    }).select("_id studentId admissionNumber");

    if (students.length === 0) {
      return res.status(400).json({
        message: "There are no active students in this class to submit.",
      });
    }

    const studentIds = students.map((student) => student._id);

    const savedRemarks = await ClassTeacherRemark.find({
      school: req.user.school,
      schoolClass,
      academicSession,
      academicTerm,
      student: { $in: studentIds },
    }).select("student remark");

    const remarksByStudent = new Map(
      savedRemarks.map((item) => [item.student.toString(), item])
    );

    const missingRemarks = students.filter((student) => {
      const saved = remarksByStudent.get(student._id.toString());
      return !saved || !saved.remark?.trim();
    });

    if (missingRemarks.length > 0) {
      return res.status(400).json({
        message:
          "Complete a remark for every active student before submitting.",
        missingCount: missingRemarks.length,
        missingStudents: missingRemarks.map((student) => ({
          _id: student._id,
          studentId: student.studentId || "",
          admissionNumber: student.admissionNumber || "",
        })),
      });
    }

    const submittedAt = new Date();

    await ClassTeacherRemark.updateMany(
      {
        school: req.user.school,
        schoolClass,
        academicSession,
        academicTerm,
        student: { $in: studentIds },
      },
      {
        $set: {
          submittedAt,
          updatedBy: req.user._id,
        },
      }
    );

    return res.status(200).json({
      message: "Class teacher remarks submitted successfully.",
      count: students.length,
      isSubmitted: true,
      isLocked: false,
      canEdit: true,
      submittedAt,
    });
  } catch (error) {
    console.error("Submit class teacher remarks error:", error);

    return res.status(500).json({
      message: "Failed to submit class teacher remarks.",
    });
  }
};