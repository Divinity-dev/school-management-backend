import bcrypt from "bcrypt";
import Student from "../models/Student.js";
import AcademicSession from "../models/AcademicSession.js";
import SchoolClass from "../models/SchoolClass.js";
import User from "../models/User.js";

// @desc    Create student
// @route   POST /api/students
// @access  Private - School Admin
export const createStudent = async (req, res) => {
  try {
    const {
      studentId,
      firstName,
      middleName,
      lastName,
      dateOfBirth,
      gender,
      admissionDate,
      profileImage,
      academicSession,
      schoolClass,
      parent,
      address,
      phone,
    } = req.body;

    if (
      !studentId ||
      !firstName ||
      !lastName ||
      !dateOfBirth ||
      !gender ||
      !admissionDate ||
      !academicSession ||
      !schoolClass
    ) {
      return res.status(400).json({
        message:
          "Student ID, first name, last name, date of birth, gender, admission date, academic session and class are required",
      });
    }

    // Make sure the academic session belongs to this school
    const session = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
      isActive: true,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    // Make sure the class belongs to this school and session
    const classRecord = await SchoolClass.findOne({
      _id: schoolClass,
      school: req.user.school,
      academicSession,
      isActive: true,
    });

    if (!classRecord) {
      return res.status(404).json({
        message:
          "Class not found or does not belong to the selected academic session",
      });
    }

    // Validate parent if provided
    if (parent) {
      const parentUser = await User.findOne({
        _id: parent,
        school: req.user.school,
        role: "parent",
        isActive: true,
      });

      if (!parentUser) {
        return res.status(400).json({
          message: "Invalid or inactive parent",
        });
      }
    }

    // Prevent duplicate student ID within the school
    const existingStudent = await Student.findOne({
      school: req.user.school,
      studentId: studentId.trim(),
    });

    if (existingStudent) {
      return res.status(400).json({
        message: "A student with this student ID already exists",
      });
    }

    const student = await Student.create({
      school: req.user.school,
      studentId: studentId.trim(),
      firstName: firstName.trim(),
      middleName: middleName?.trim() || "",
      lastName: lastName.trim(),
      dateOfBirth,
      gender,
      admissionDate,
      profileImage: profileImage || "",
      academicSession,
      schoolClass,
      parent: parent || null,
      address: address?.trim() || "",
      phone: phone?.trim() || "",
    });

    res.status(201).json({
      message: "Student created successfully",
      student,
    });
  } catch (error) {
    console.error("Create student error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Create portal account for an existing student
// @route   POST /api/students/:id/create-account
// @access  Private - School Admin
export const createStudentPortalAccount = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find the existing student in the admin's school
    const student = await Student.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    if (!student.isActive) {
      return res.status(400).json({
        message: "Cannot create an account for an inactive student",
      });
    }

    // Prevent creating a second portal account
    if (student.user) {
      return res.status(400).json({
        message: "This student already has a portal account",
      });
    }

    // Make sure the email is not already being used
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        message: "A user with this email already exists",
      });
    }

    // Hash password using the same method as registration
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create the student User account
    const user = await User.create({
      firstName: student.firstName,
      lastName: student.lastName,
      email: normalizedEmail,
      password: hashedPassword,
      role: "student",
      school: student.school,
      phone: student.phone || "",
    });

    // Link the Student record to the User account
    student.user = user._id;

    await student.save();

    return res.status(201).json({
      message: "Student portal account created successfully",

      student: {
        id: student._id,
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        user: student.user,
      },

      account: {
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Create student portal account error:", error);

    res.status(500).json({
      message: "Server error while creating student portal account",
    });
  }
};

// @desc    Get all students for school
// @route   GET /api/students
// @access  Private
export const getStudents = async (req, res) => {
  try {
    const students = await Student.find({
      school: req.user.school,
    })
      .populate(
        "academicSession",
        "name startDate endDate"
      )
      .populate(
        "schoolClass",
        "name arm section"
      )
      .populate(
        "parent",
        "firstName lastName email phone"
      )
      .sort({ lastName: 1, firstName: 1 });

    res.status(200).json({
      students,
    });
  } catch (error) {
    console.error("Get students error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get active students for an academic session
// @route   GET /api/students/session/:sessionId
// @access  Private
export const getStudentsBySession = async (req, res) => {
  try {
    const session = await AcademicSession.findOne({
      _id: req.params.sessionId,
      school: req.user.school,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    const students = await Student.find({
      school: req.user.school,
      academicSession: session._id,
      isActive: true,
    })
      .populate(
        "schoolClass",
        "name arm section"
      )
      .populate(
        "parent",
        "firstName lastName email phone"
      )
      .sort({ lastName: 1, firstName: 1 });

    res.status(200).json({
      students,
    });
  } catch (error) {
    console.error("Get students by session error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get students in a class
// @route   GET /api/students/class/:classId
// @access  Private
export const getStudentsByClass = async (req, res) => {
  try {
    const schoolClass = await SchoolClass.findOne({
      _id: req.params.classId,
      school: req.user.school,
    });

    if (!schoolClass) {
      return res.status(404).json({
        message: "Class not found",
      });
    }

    const students = await Student.find({
      school: req.user.school,
      schoolClass: schoolClass._id,
      isActive: true,
    })
      .populate(
        "academicSession",
        "name startDate endDate"
      )
      .populate(
        "parent",
        "firstName lastName email phone"
      )
      .sort({ lastName: 1, firstName: 1 });

    res.status(200).json({
      students,
    });
  } catch (error) {
    console.error("Get students by class error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Private
export const getStudent = async (req, res) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      school: req.user.school,
    })
      .populate(
        "academicSession",
        "name startDate endDate"
      )
      .populate(
        "schoolClass",
        "name arm section"
      )
      .populate(
        "parent",
        "firstName lastName email phone"
      );

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    res.status(200).json({
      student,
    });
  } catch (error) {
    console.error("Get student error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private - School Admin
export const updateStudent = async (req, res) => {
  try {
    const {
      studentId,
      firstName,
      middleName,
      lastName,
      dateOfBirth,
      gender,
      admissionDate,
      profileImage,
      academicSession,
      schoolClass,
      parent,
      address,
      phone,
      isActive,
    } = req.body;

    const student = await Student.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    const targetSessionId =
      academicSession !== undefined
        ? academicSession
        : student.academicSession;

    const targetClassId =
      schoolClass !== undefined
        ? schoolClass
        : student.schoolClass;

    // Validate academic session
    const session = await AcademicSession.findOne({
      _id: targetSessionId,
      school: req.user.school,
      isActive: true,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    // Validate class belongs to target session
    const targetClass = await SchoolClass.findOne({
      _id: targetClassId,
      school: req.user.school,
      academicSession: targetSessionId,
      isActive: true,
    });

    if (!targetClass) {
      return res.status(404).json({
        message:
          "Class not found or does not belong to the selected academic session",
      });
    }

    // Validate student ID if changed
    if (studentId !== undefined) {
      const existingStudent = await Student.findOne({
        school: req.user.school,
        studentId: studentId.trim(),
        _id: { $ne: student._id },
      });

      if (existingStudent) {
        return res.status(400).json({
          message: "A student with this student ID already exists",
        });
      }

      student.studentId = studentId.trim();
    }

    // Validate parent if changed
    if (parent !== undefined && parent !== null) {
      const parentUser = await User.findOne({
        _id: parent,
        school: req.user.school,
        role: "parent",
        isActive: true,
      });

      if (!parentUser) {
        return res.status(400).json({
          message: "Invalid or inactive parent",
        });
      }
    }

    if (firstName !== undefined) {
      student.firstName = firstName.trim();
    }

    if (middleName !== undefined) {
      student.middleName = middleName.trim();
    }

    if (lastName !== undefined) {
      student.lastName = lastName.trim();
    }

    if (dateOfBirth !== undefined) {
      student.dateOfBirth = dateOfBirth;
    }

    if (gender !== undefined) {
      student.gender = gender;
    }

    if (admissionDate !== undefined) {
      student.admissionDate = admissionDate;
    }

    if (profileImage !== undefined) {
      student.profileImage = profileImage;
    }

    if (academicSession !== undefined) {
      student.academicSession = academicSession;
    }

    if (schoolClass !== undefined) {
      student.schoolClass = schoolClass;
    }

    if (parent !== undefined) {
      student.parent = parent;
    }

    if (address !== undefined) {
      student.address = address.trim();
    }

    if (phone !== undefined) {
      student.phone = phone.trim();
    }

    if (isActive !== undefined) {
      student.isActive = isActive;
    }

    await student.save();

    res.status(200).json({
      message: "Student updated successfully",
      student,
    });
  } catch (error) {
    console.error("Update student error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Deactivate student
// @route   PATCH /api/students/:id/deactivate
// @access  Private - School Admin
export const deactivateStudent = async (req, res) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    student.isActive = false;

    await student.save();

    res.status(200).json({
      message: "Student deactivated successfully",
      student,
    });
  } catch (error) {
    console.error("Deactivate student error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};