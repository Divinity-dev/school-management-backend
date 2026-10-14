import mongoose from "mongoose";

import School from "../models/School.js";
import Student from "../models/Student.js";
import Result from "../models/Result.js";
import Attendance from "../models/Attendance.js";
import SchoolClass from "../models/SchoolClass.js";
import AcademicSession from "../models/AcademicSession.js";
import AcademicTerm from "../models/AcademicTerm.js";
import ClassTeacherRemark from "../models/ClassTeacherRemark.js";
import SchoolTermSetting from "../models/SchoolTermSetting.js";

const isValidId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

const getSchoolId = (user) => user?.school?._id || user?.school;

const hasManualOverride = (setting) =>
  setting?.schoolDaysOpenedOverride !== null &&
  setting?.schoolDaysOpenedOverride !== undefined;

/*
|--------------------------------------------------------------------------
| Calculate school-wide days opened
|--------------------------------------------------------------------------
*/

const getDistinctSchoolDays = async ({
  schoolId,
  academicSessionId,
  academicTermId,
}) => {
  const dates = await Attendance.aggregate([
    {
      $match: {
        school: new mongoose.Types.ObjectId(String(schoolId)),
        academicSession: new mongoose.Types.ObjectId(
          String(academicSessionId)
        ),
        term: new mongoose.Types.ObjectId(String(academicTermId)),
        date: { $type: "date" },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$date",
            timezone: "UTC",
          },
        },
      },
    },
    {
      $count: "total",
    },
  ]);

  return dates[0]?.total || 0;
};

/*
|--------------------------------------------------------------------------
| Grading helpers
|--------------------------------------------------------------------------
*/

const getGradingScale = (gradingSystem, fallbackGradingSystem) => {
  if (gradingSystem?.gradingScale?.length) {
    return gradingSystem.gradingScale;
  }

  if (fallbackGradingSystem?.gradingScale?.length) {
    return fallbackGradingSystem.gradingScale;
  }

  return [];
};

const getGradeForScore = (score, gradingScale = []) => {
  const matchingGrade = gradingScale.find(
    (range) => score >= range.min && score <= range.max
  );

  return matchingGrade
    ? {
        grade: matchingGrade.grade || "",
        remark: matchingGrade.remark || "",
      }
    : {
        grade: "",
        remark: "",
      };
};

/*
|--------------------------------------------------------------------------
| Validate academic session and term
|--------------------------------------------------------------------------
*/

const getSchoolAndTerm = async ({
  schoolId,
  academicSession,
  academicTerm,
}) => {
  const session = await AcademicSession.findOne({
    _id: academicSession,
    school: schoolId,
  }).lean();

  if (!session) {
    return {
      error: {
        status: 404,
        message: "Academic session not found.",
      },
    };
  }

  const term = await AcademicTerm.findOne({
    _id: academicTerm,
    school: schoolId,
    academicSession,
  }).lean();

  if (!term) {
    return {
      error: {
        status: 404,
        message: "Academic term not found for this session.",
      },
    };
  }

  return { session, term };
};

/*
|--------------------------------------------------------------------------
| Get school-days data
|--------------------------------------------------------------------------
*/

const getSchoolDaysData = async ({
  schoolId,
  academicSession,
  academicTerm,
}) => {
  const [setting, automaticSchoolDays] = await Promise.all([
    SchoolTermSetting.findOne({
      school: schoolId,
      academicSession,
      academicTerm,
    }).lean(),

    getDistinctSchoolDays({
      schoolId,
      academicSessionId: academicSession,
      academicTermId: academicTerm,
    }),
  ]);

  const isManualOverride = hasManualOverride(setting);

  return {
    schoolDaysOpened: isManualOverride
      ? setting.schoolDaysOpenedOverride
      : automaticSchoolDays,

    automaticSchoolDays,

    schoolDaysOpenedOverride: isManualOverride
      ? setting.schoolDaysOpenedOverride
      : null,

    isManualOverride,
  };
};

/*
|--------------------------------------------------------------------------
| Get school-wide days opened
|--------------------------------------------------------------------------
| GET /api/results/school-days-opened
|--------------------------------------------------------------------------
*/

export const getSchoolDaysOpened = async (req, res) => {
  try {
    const schoolId = getSchoolId(req.user);
    const { academicSession, academicTerm } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "Your account is not associated with a school.",
      });
    }

    if (
      !isValidId(academicSession) ||
      !isValidId(academicTerm)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid academic session and term are required.",
      });
    }

    const period = await getSchoolAndTerm({
      schoolId,
      academicSession,
      academicTerm,
    });

    if (period.error) {
      return res.status(period.error.status).json({
        success: false,
        message: period.error.message,
      });
    }

    const daysData = await getSchoolDaysData({
      schoolId,
      academicSession,
      academicTerm,
    });

    return res.status(200).json({
      success: true,
      data: {
        academicSession: period.session._id,
        academicTerm: period.term._id,
        termName: period.term.name,
        ...daysData,
      },
    });
  } catch (error) {
    console.error("Get school days opened error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve school days opened.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Set or clear school-wide days opened
|--------------------------------------------------------------------------
| PUT /api/results/school-days-opened
|--------------------------------------------------------------------------
*/

export const updateSchoolDaysOpened = async (req, res) => {
  try {
    const schoolId = getSchoolId(req.user);

    const {
      academicSession,
      academicTerm,
      schoolDaysOpened,
    } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "Your account is not associated with a school.",
      });
    }

    if (
      !isValidId(academicSession) ||
      !isValidId(academicTerm)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid academic session and term are required.",
      });
    }

    if (
      schoolDaysOpened !== null &&
      (
        typeof schoolDaysOpened !== "number" ||
        !Number.isInteger(schoolDaysOpened) ||
        schoolDaysOpened < 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "School days opened must be a non-negative whole number or null.",
      });
    }

    const period = await getSchoolAndTerm({
      schoolId,
      academicSession,
      academicTerm,
    });

    if (period.error) {
      return res.status(period.error.status).json({
        success: false,
        message: period.error.message,
      });
    }

    await SchoolTermSetting.findOneAndUpdate(
      {
        school: schoolId,
        academicSession,
        academicTerm,
      },
      {
        $set: {
          schoolDaysOpenedOverride: schoolDaysOpened,
          updatedBy: req.user._id,
        },
        $setOnInsert: {
          enteredBy: req.user._id,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    const daysData = await getSchoolDaysData({
      schoolId,
      academicSession,
      academicTerm,
    });

    return res.status(200).json({
      success: true,
      message: daysData.isManualOverride
        ? "School days opened updated successfully."
        : "Automatic school-days calculation restored.",
      data: {
        academicSession: period.session._id,
        academicTerm: period.term._id,
        termName: period.term.name,
        ...daysData,
      },
    });
  } catch (error) {
    console.error("Update school days opened error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update school days opened.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get a student's term report card
|--------------------------------------------------------------------------
| GET /api/results/report-card
|
| Student:
|   ?academicSession=SESSION_ID&academicTerm=TERM_ID
|
| Parent, teacher, schoolAdmin:
|   ?academicSession=SESSION_ID&academicTerm=TERM_ID&studentId=STUDENT_ID
|
| Only published and locked results are included.
|--------------------------------------------------------------------------
*/

export const getMyReportCard = async (req, res) => {
  try {
    const allowedRoles = [
      "student",
      "parent",
      "teacher",
      "schoolAdmin",
    ];

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access report cards.",
      });
    }

    const schoolId = getSchoolId(req.user);

    const {
      academicSession,
      academicTerm,
      studentId,
    } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "Your account is not associated with a school.",
      });
    }

    if (
      !isValidId(academicSession) ||
      !isValidId(academicTerm)
    ) {
      return res.status(400).json({
        success: false,
        message: "Select a valid academic session and term.",
      });
    }

    const period = await getSchoolAndTerm({
      schoolId,
      academicSession,
      academicTerm,
    });

    if (period.error) {
      return res.status(period.error.status).json({
        success: false,
        message: period.error.message,
      });
    }

    const school = await School.findOne({
      _id: schoolId,
      isActive: true,
    }).lean();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: "School not found or is inactive.",
      });
    }

    /*
     * Students may only request their own report cards.
     * Other permitted roles must provide a student ID.
     */
    let student;

    if (req.user.role === "student") {
      student = await Student.findOne({
        user: req.user._id,
        school: schoolId,
        isActive: true,
      }).lean();
    } else {
      if (!isValidId(studentId)) {
        return res.status(400).json({
          success: false,
          message: "A valid student ID is required.",
        });
      }

      const studentFilter = {
        _id: studentId,
        school: schoolId,
        isActive: true,
      };

      /*
       * Parents may only view students linked to their account.
       */
      if (req.user.role === "parent") {
        studentFilter.parent = req.user._id;
      }

      student = await Student.findOne(studentFilter).lean();
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message:
          "Student not found or you are not authorized to access this report card.",
      });
    }

    /*
     * Only published or locked results are available for printing.
     */
    const results = await Result.find({
      school: schoolId,
      student: student._id,
      academicSession,
      academicTerm,
      status: { $in: ["published", "locked"] },
    })
      .populate("subject", "name code")
      .populate("schoolClass", "name arm section")
      .lean();

    if (!results.length) {
      return res.status(404).json({
        success: false,
        message:
          "No published results are available for the selected term yet.",
      });
    }

    const classId = results[0].schoolClass?._id;

    if (!classId) {
      return res.status(409).json({
        success: false,
        message:
          "The student's results are missing their class information.",
      });
    }

    const hasDifferentClasses = results.some(
      (result) =>
        String(result.schoolClass?._id) !== String(classId)
    );

    if (hasDifferentClasses) {
      return res.status(409).json({
        success: false,
        message:
          "Results for this term belong to different classes. Please contact the school administrator.",
      });
    }

    /*
     * Confirm that the class belongs to this school and session.
     * The class teacher field is used to authorize teacher access.
     */
    const resultClass = await SchoolClass.findOne({
      _id: classId,
      school: schoolId,
      academicSession,
    })
      .select("name arm section classTeacher")
      .lean();

    if (!resultClass) {
      return res.status(409).json({
        success: false,
        message:
          "The result class does not belong to this school and academic session.",
      });
    }

    if (req.user.role === "teacher") {
      const isClassTeacher =
        String(resultClass.classTeacher || "") ===
        String(req.user._id);

      if (!isClassTeacher) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to access report cards for this class.",
        });
      }
    }

    /*
     * Retrieve the submitted class teacher remark, attendance,
     * and school-days data together.
     */
    const [
      remarkRecord,
      attendanceRecords,
      daysData,
    ] = await Promise.all([
      ClassTeacherRemark.findOne({
        school: schoolId,
        student: student._id,
        schoolClass: classId,
        academicSession,
        academicTerm,
        submittedAt: { $ne: null },
      }).lean(),

      Attendance.find({
        school: schoolId,
        student: student._id,
        class: classId,
        academicSession,
        term: academicTerm,
      })
        .select("status date")
        .lean(),

      getSchoolDaysData({
        schoolId,
        academicSession,
        academicTerm,
      }),
    ]);

    /*
     * Calculate attendance counts from attendance records.
     * A submitted teacher override takes precedence when enabled.
     */
    const attendanceCounts = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };

    for (const record of attendanceRecords) {
      if (
        Object.prototype.hasOwnProperty.call(
          attendanceCounts,
          record.status
        )
      ) {
        attendanceCounts[record.status] += 1;
      }
    }

    const attendanceOverride =
      remarkRecord?.attendanceOverride;

    const isUsingTeacherOverride =
      attendanceOverride?.enabled === true;

    const finalAttendanceCounts = isUsingTeacherOverride
      ? {
          present: Number(attendanceOverride.present || 0),
          absent: Number(attendanceOverride.absent || 0),
          late: Number(attendanceOverride.late || 0),
          excused: Number(attendanceOverride.excused || 0),
        }
      : attendanceCounts;

    const daysAttended =
      finalAttendanceCounts.present +
      finalAttendanceCounts.late;

    const attendancePercentage =
      daysData.schoolDaysOpened > 0
        ? Math.min(
            100,
            Number(
              (
                (daysAttended / daysData.schoolDaysOpened) *
                100
              ).toFixed(2)
            )
          )
        : 0;

    /*
     * Prefer the grading-system snapshot stored with the results.
     */
    const gradingSystem =
      results.find(
        (result) =>
          result.gradingSystem?.gradingScale?.length
      )?.gradingSystem ||
      results.find((result) => result.gradingSystem)
        ?.gradingSystem ||
      school.gradingSystem ||
      {};

    const gradingScale = getGradingScale(
      gradingSystem,
      school.gradingSystem
    );

    const totalMaximum = Number(
      gradingSystem.totalMaximum ??
      school.gradingSystem?.totalMaximum ??
      100
    );

    const subjects = results.map((result) => {
      const subjectMaximum = Number(
        result.gradingSystem?.totalMaximum ??
        totalMaximum
      );

      return {
        resultId: result._id,
        subject: result.subject?.name || "Unknown subject",
        subjectCode: result.subject?.code || "",
        caScore: Number(result.caScore || 0),
        examScore: Number(result.examScore || 0),
        total: Number(result.total || 0),
        totalMaximum: subjectMaximum,
        grade: result.grade || "",
        remark: result.remark || "",
        assessmentScores: result.assessmentScores || [],
        status: result.status,
      };
    });

    const totalScore = Number(
      subjects
        .reduce((sum, subject) => sum + subject.total, 0)
        .toFixed(2)
    );

    const averageScore =
      subjects.length > 0
        ? Number((totalScore / subjects.length).toFixed(2))
        : 0;

    /*
     * Calculate the average percentage per subject so differing
     * maximum scores do not distort the overall grade.
     */
    const averagePercentage =
      subjects.length > 0
        ? Number(
            (
              subjects.reduce((sum, subject) => {
                if (subject.totalMaximum <= 0) {
                  return sum;
                }

                return (
                  sum +
                  (subject.total / subject.totalMaximum) * 100
                );
              }, 0) / subjects.length
            ).toFixed(2)
          )
        : 0;

    const overallGrade = getGradeForScore(
      averagePercentage,
      gradingScale
    );

    const studentName = [
      student.firstName,
      student.middleName,
      student.lastName,
    ]
      .filter(Boolean)
      .join(" ");

    return res.status(200).json({
      success: true,
      data: {
        school: {
          name: school.name || "",
          logo: school.logo || "",
          address: school.address || "",
          city: school.city || "",
          state: school.state || "",
          country: school.country || "",
          phone: school.phone || "",
          email: school.email || "",
          principalName:
            school.publicProfile?.principalName || "",
          principalSignature:
            school.principalSignature || "",
          principalStamp:
            school.principalStamp || "",
        },

        student: {
          id: student._id,
          name: studentName,
          studentId: student.studentId || "",
          dateOfBirth: student.dateOfBirth || null,
          gender: student.gender || "",
          profileImage: student.profileImage || "",
          class: {
            name: resultClass.name || "",
            arm: resultClass.arm || "",
            section: resultClass.section || "",
          },
        },

        academicPeriod: {
          sessionId: period.session._id,
          sessionName: period.session.name || "",
          termId: period.term._id,
          termName: period.term.name || "",
          startDate: period.term.startDate,
          endDate: period.term.endDate,
        },

        attendance: {
          schoolDaysOpened: daysData.schoolDaysOpened,
          automaticSchoolDays: daysData.automaticSchoolDays,
          isManualOverride: daysData.isManualOverride,
          present: finalAttendanceCounts.present,
          absent: finalAttendanceCounts.absent,
          late: finalAttendanceCounts.late,
          excused: finalAttendanceCounts.excused,
          daysAttended,
          attendancePercentage,
          isUsingTeacherOverride,
        },

        subjects,

        summary: {
          subjectCount: subjects.length,
          totalScore,
          averageScore,
          averagePercentage,
          totalMaximum,
          overallGrade: overallGrade.grade,
          overallRemark: overallGrade.remark,
        },

        gradingSystem: {
          caMaximum: Number(
            gradingSystem.caMaximum ??
            school.gradingSystem?.caMaximum ??
            40
          ),
          examMaximum: Number(
            gradingSystem.examMaximum ??
            school.gradingSystem?.examMaximum ??
            60
          ),
          totalMaximum,
          caComponents: gradingSystem.caComponents || [],
          gradingScale,
        },

        classTeacherRemark: remarkRecord?.remark || "",
      },
    });
  } catch (error) {
    console.error("Get report card error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate the report card.",
    });
  }
};

