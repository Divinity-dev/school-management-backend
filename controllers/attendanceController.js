import Attendance from "../models/Attendance.js";
import Student from "../models/Student.js";
import SchoolClass from "../models/SchoolClass.js";
import AcademicSession from "../models/AcademicSession.js";
import AcademicTerm from "../models/AcademicTerm.js";

// Check whether the current user can manage attendance for a class
const canManageClassAttendance = (user, schoolClass) => {
  if (!user || !schoolClass) {
    return false;
  }

  // Super admin can manage any school
  if (user.role === "superAdmin") {
    return true;
  }

  // User must belong to the same school
  if (!user.school || user.school.toString() !== schoolClass.school.toString()) {
    return false;
  }

  // School admin can manage attendance for their school
  if (user.role === "schoolAdmin") {
    return true;
  }

  // Teacher can manage attendance for a class they are assigned to
  if (user.role === "teacher") {
    return (
      schoolClass.classTeacher &&
      schoolClass.classTeacher.toString() === user._id.toString()
    );
  }

  return false;
};

// Mark attendance
export const markAttendance = async (req, res) => {
  try {
    const {
      school,
      academicSession,
      term,
      class: classId,
      student,
      date,
      status,
      remarks,
    } = req.body;

    if (
      !school ||
      !academicSession ||
      !term ||
      !classId ||
      !student ||
      !date ||
      !status
    ) {
      return res.status(400).json({
        message: "All required attendance fields must be provided",
      });
    }

    // Validate status
    const allowedStatuses = ["present", "absent", "late", "excused"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid attendance status",
      });
    }

    // Find the class
    const schoolClass = await SchoolClass.findById(classId);

    if (!schoolClass) {
      return res.status(404).json({
        message: "Class not found",
      });
    }

    // Prevent cross-school attendance
    if (
      req.user.role !== "superAdmin" &&
      (!req.user.school ||
        req.user.school.toString() !== schoolClass.school.toString())
    ) {
      return res.status(403).json({
        message: "You are not authorized to manage attendance for this school",
      });
    }

    // Make sure the class belongs to the supplied school
    if (schoolClass.school.toString() !== school.toString()) {
      return res.status(400).json({
        message: "Class does not belong to the specified school",
      });
    }

    // Check whether user can manage this class
    if (!canManageClassAttendance(req.user, schoolClass)) {
      return res.status(403).json({
        message:
          "You are not authorized to mark attendance for this class",
      });
    }

    // Find student
    const existingStudent = await Student.findById(student);

    if (!existingStudent) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    // Make sure student belongs to the same school
    if (
      existingStudent.school.toString() !== schoolClass.school.toString()
    ) {
      return res.status(403).json({
        message: "Student does not belong to this school",
      });
    }

    // Make sure student belongs to the selected class
    if (
      existingStudent.schoolClass.toString() !== schoolClass._id.toString()
    ) {
      return res.status(400).json({
        message: "Student does not belong to the selected class",
      });
    }

    // Make sure student's academic session matches the class
    if (
      existingStudent.academicSession.toString() !==
      schoolClass.academicSession.toString()
    ) {
      return res.status(400).json({
        message: "Student and class belong to different academic sessions",
      });
    }

    // Make sure the academic session exists
    const session = await AcademicSession.findById(academicSession);

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    // Make sure class belongs to supplied academic session
    if (
      schoolClass.academicSession.toString() !==
      academicSession.toString()
    ) {
      return res.status(400).json({
        message: "Class does not belong to the specified academic session",
      });
    }

    // Make sure term exists
    const academicTerm = await AcademicTerm.findById(term);

    if (!academicTerm) {
      return res.status(404).json({
        message: "Academic term not found",
      });
    }

    // Check for existing attendance
    const existingAttendance = await Attendance.findOne({
      student,
      term,
      date: {
        $gte: new Date(`${date}T00:00:00.000Z`),
        $lt: new Date(`${date}T23:59:59.999Z`),
      },
    });

    if (existingAttendance) {
      return res.status(400).json({
        message: "Attendance has already been marked for this student today",
      });
    }

    const attendance = await Attendance.create({
      school: schoolClass.school,
      academicSession,
      term,
      class: classId,
      student,
      date,
      status,
      remarks,
      markedBy: req.user._id,
    });

    const populatedAttendance = await Attendance.findById(attendance._id)
      .populate("student", "firstName lastName studentId")
      .populate("class", "name arm section")
      .populate("academicSession", "name")
      .populate("term", "name")
      .populate("markedBy", "firstName lastName email role");

    res.status(201).json({
      message: "Attendance marked successfully",
      attendance: populatedAttendance,
    });
  } catch (error) {
    console.error("Mark attendance error:", error);

    res.status(500).json({
      message: "Server error while marking attendance",
      error: error.message,
    });
  }
};

// Get attendance for a class on a specific date
export const getClassAttendance = async (req, res) => {
  try {
    const { classId, date, term } = req.query;

    if (!classId || !date || !term) {
      return res.status(400).json({
        message: "classId, date and term are required",
      });
    }

    const schoolClass = await SchoolClass.findById(classId);

    if (!schoolClass) {
      return res.status(404).json({
        message: "Class not found",
      });
    }

    // School isolation
    if (
      req.user.role !== "superAdmin" &&
      (!req.user.school ||
        req.user.school.toString() !== schoolClass.school.toString())
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this class attendance",
      });
    }

    // Teachers can only view attendance for their assigned class
    if (
      req.user.role === "teacher" &&
      (!schoolClass.classTeacher ||
        schoolClass.classTeacher.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this class attendance",
      });
    }

    // Students and parents cannot access class-wide attendance
    if (!["superAdmin", "schoolAdmin", "teacher"].includes(req.user.role)) {
      return res.status(403).json({
        message: "You are not authorized to view class attendance",
      });
    }

    const startDate = new Date(`${date}T00:00:00.000Z`);
    const endDate = new Date(`${date}T23:59:59.999Z`);

    const attendance = await Attendance.find({
      school: schoolClass.school,
      class: classId,
      term,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .populate("student", "firstName lastName studentId")
      .populate("class", "name arm section")
      .populate("academicSession", "name")
      .populate("term", "name")
      .populate("markedBy", "firstName lastName email")
      .sort({ "student.firstName": 1 });

    res.status(200).json({
      count: attendance.length,
      attendance,
    });
  } catch (error) {
    console.error("Get class attendance error:", error);

    res.status(500).json({
      message: "Server error while fetching class attendance",
      error: error.message,
    });
  }
};

// Get attendance for a specific student
export const getStudentAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term } = req.query;

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    // School isolation
    if (
      req.user.role !== "superAdmin" &&
      (!req.user.school ||
        req.user.school.toString() !== student.school.toString())
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this student's attendance",
      });
    }

    // Students can only view their own attendance
    if (
      req.user.role === "student" &&
      req.user._id.toString() !== student.parent?.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this attendance",
      });
    }

    // Parents can only view their own child's attendance
    if (
      req.user.role === "parent" &&
      (!student.parent ||
        student.parent.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this student's attendance",
      });
    }

    // Teachers can only view students in their assigned class
    if (req.user.role === "teacher") {
      const schoolClass = await SchoolClass.findById(student.schoolClass);

      if (
        !schoolClass ||
        !schoolClass.classTeacher ||
        schoolClass.classTeacher.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          message: "You are not authorized to view this student's attendance",
        });
      }
    }

    const query = {
      school: student.school,
      student: studentId,
    };

    if (term) {
      query.term = term;
    }

    const attendance = await Attendance.find(query)
      .populate("student", "firstName lastName studentId")
      .populate("class", "name arm section")
      .populate("academicSession", "name")
      .populate("term", "name")
      .populate("markedBy", "firstName lastName email")
      .sort({ date: -1 });

    res.status(200).json({
      count: attendance.length,
      attendance,
    });
  } catch (error) {
    console.error("Get student attendance error:", error);

    res.status(500).json({
      message: "Server error while fetching student attendance",
      error: error.message,
    });
  }
};

// Update attendance
export const updateAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { status, remarks } = req.body;

    const attendance = await Attendance.findById(attendanceId);

    if (!attendance) {
      return res.status(404).json({
        message: "Attendance record not found",
      });
    }

    const schoolClass = await SchoolClass.findById(attendance.class);

    if (!schoolClass) {
      return res.status(404).json({
        message: "Class associated with attendance not found",
      });
    }

    // School isolation
    if (
      req.user.role !== "superAdmin" &&
      (!req.user.school ||
        req.user.school.toString() !== attendance.school.toString())
    ) {
      return res.status(403).json({
        message: "You are not authorized to update this attendance",
      });
    }

    // Check class-level authorization
    if (!canManageClassAttendance(req.user, schoolClass)) {
      return res.status(403).json({
        message: "You are not authorized to update this attendance",
      });
    }

    // Validate status
    const allowedStatuses = ["present", "absent", "late", "excused"];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid attendance status",
      });
    }

    if (status) {
      attendance.status = status;
    }

    if (remarks !== undefined) {
      attendance.remarks = remarks;
    }

    await attendance.save();

    const updatedAttendance = await Attendance.findById(attendance._id)
      .populate("student", "firstName lastName studentId")
      .populate("class", "name arm section")
      .populate("academicSession", "name")
      .populate("term", "name")
      .populate("markedBy", "firstName lastName email role");

    res.status(200).json({
      message: "Attendance updated successfully",
      attendance: updatedAttendance,
    });
  } catch (error) {
    console.error("Update attendance error:", error);

    res.status(500).json({
      message: "Server error while updating attendance",
      error: error.message,
    });
  }
};

export const getStudentAttendanceSummary = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term } = req.query;

    if (!term) {
      return res.status(400).json({
        message: "Term is required",
      });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    // School isolation
    if (
      req.user.role !== "superAdmin" &&
      student.school.toString() !== req.user.school.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this student's attendance",
      });
    }

    // Parents can only view their own child's attendance
    if (
      req.user.role === "parent" &&
      student.parent?.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this student's attendance",
      });
    }

    // Students cannot currently be mapped safely because Student
    // does not yet contain a user reference.
    if (req.user.role === "student") {
      return res.status(403).json({
        message: "Student attendance access is not yet configured",
      });
    }

    const records = await Attendance.find({
      school: student.school,
      student: student._id,
      term,
    }).sort({ date: 1 });

    const summary = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      total: records.length,
    };

    records.forEach((record) => {
      summary[record.status] += 1;
    });

    summary.attendancePercentage =
      summary.total > 0
        ? Number(
            (
              ((summary.present + summary.late) / summary.total) *
              100
            ).toFixed(2)
          )
        : 0;

    res.status(200).json({
      student: {
        id: student._id,
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
      },
      term,
      summary,
    });
  } catch (error) {
    console.error("Get student attendance summary error:", error);

    res.status(500).json({
      message: "Server error while fetching attendance summary",
    });
  }
};

export const getClassAttendanceSummary = async (req, res) => {
  try {
    const { classId } = req.query;
    const { term } = req.query;

    if (!classId || !term) {
      return res.status(400).json({
        message: "classId and term are required",
      });
    }

    const schoolClass = await SchoolClass.findById(classId);

    if (!schoolClass) {
      return res.status(404).json({
        message: "Class not found",
      });
    }

    // School isolation
    if (
      req.user.role !== "superAdmin" &&
      schoolClass.school.toString() !== req.user.school.toString()
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this class attendance",
      });
    }

    // Only school admins, super admins and the class teacher
    // can view the complete class summary.
    if (req.user.role === "teacher") {
      const isClassTeacher =
        schoolClass.classTeacher?.toString() === req.user._id.toString();

      if (!isClassTeacher) {
        return res.status(403).json({
          message: "You are not authorized to view this class attendance",
        });
      }
    } else if (
      req.user.role !== "schoolAdmin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this class attendance",
      });
    }

    const students = await Student.find({
      school: schoolClass.school,
      schoolClass: schoolClass._id,
      academicSession: schoolClass.academicSession,
      isActive: true,
    }).select(
      "_id studentId firstName middleName lastName"
    );

    const attendanceRecords = await Attendance.find({
      school: schoolClass.school,
      class: schoolClass._id,
      term,
    }).sort({ date: 1 });

    const summary = students.map((student) => {
      const studentRecords = attendanceRecords.filter(
        (record) =>
          record.student.toString() === student._id.toString()
      );

      const stats = {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        total: studentRecords.length,
      };

      studentRecords.forEach((record) => {
        stats[record.status] += 1;
      });

      stats.attendancePercentage =
        stats.total > 0
          ? Number(
              (
                ((stats.present + stats.late) / stats.total) *
                100
              ).toFixed(2)
            )
          : 0;

      return {
        student: {
          id: student._id,
          studentId: student.studentId,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
        },
        attendance: stats,
      };
    });

    res.status(200).json({
      class: {
        id: schoolClass._id,
        name: schoolClass.name,
        arm: schoolClass.arm,
        section: schoolClass.section,
      },
      term,
      totalStudents: students.length,
      students: summary,
    });
  } catch (error) {
    console.error("Get class attendance summary error:", error);

    res.status(500).json({
      message: "Server error while fetching class attendance summary",
    });
  }
};



