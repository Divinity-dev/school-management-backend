import bcrypt from "bcrypt";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Result from "../models/Result.js";
import StudentFeeAccount from "../models/StudentFeeAccount.js";
import Payment from "../models/Payment.js";

const DEFAULT_PARENT_PASSWORD = "password123";

export const createParent = async (req, res) => {
  try {
    const schoolId = req.user?.school?._id || req.user?.school;

    const { firstName, lastName, email, phone } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        message:
          "First name, last name, and email are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        message: "A user with this email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(
      DEFAULT_PARENT_PASSWORD,
      12
    );

    const parent = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: "parent",
      school: schoolId,
      phone: phone?.trim() || "",
    });

    return res.status(201).json({
      message: "Parent account created successfully.",
      parent: {
        id: parent._id,
        firstName: parent.firstName,
        lastName: parent.lastName,
        email: parent.email,
        phone: parent.phone,
        role: parent.role,
        school: parent.school,
        isActive: parent.isActive,
      },
    });
  } catch (error) {
    console.error("Create parent error:", error);

    return res.status(500).json({
      message: "Server error while creating parent account.",
    });
  }
};

export const linkStudentToParent = async (req, res) => {
  try {
    const schoolId = req.user?.school?._id || req.user?.school;

    const { parentId, studentId } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    const parent = await User.findOne({
      _id: parentId,
      school: schoolId,
      role: "parent",
    });

    if (!parent) {
      return res.status(404).json({
        message: "Parent not found in this school.",
      });
    }

    const student = await Student.findOne({
      _id: studentId,
      school: schoolId,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student not found in this school.",
      });
    }

    if (
      student.parent &&
      student.parent.toString() !== parent._id.toString()
    ) {
      return res.status(400).json({
        message:
          "This student is already linked to another parent.",
      });
    }

    student.parent = parent._id;

    await student.save();

    const updatedStudent = await Student.findById(student._id)
      .populate("parent", "firstName lastName email phone");

    return res.status(200).json({
      message: "Student linked to parent successfully.",
      student: updatedStudent,
    });
  } catch (error) {
    console.error("Link student to parent error:", error);

    return res.status(500).json({
      message: "Server error while linking student to parent.",
    });
  }
};

export const getMyChildren = async (req, res) => {
  try {
    const schoolId = req.user?.school?._id || req.user?.school;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    const students = await Student.find({
      parent: req.user._id,
      school: schoolId,
    })
      .populate("schoolClass", "name arm section")
      .populate("academicSession", "name")
      .select(
        "studentId firstName middleName lastName dateOfBirth gender admissionDate profileImage academicSession schoolClass isActive"
      )
      .sort({ firstName: 1, lastName: 1 });

    return res.status(200).json({
      message: "Children retrieved successfully.",
      count: students.length,
      children: students,
    });
  } catch (error) {
    console.error("Get my children error:", error);

    return res.status(500).json({
      message: "Server error while retrieving children.",
    });
  }
};

export const getMyChild = async (req, res) => {
  try {
    const schoolId = req.user?.school?._id || req.user?.school;
    const { studentId } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    const student = await Student.findOne({
      _id: studentId,
      parent: req.user._id,
      school: schoolId,
    })
      .populate("schoolClass", "name arm section")
      .populate("academicSession", "name")
      .populate("parent", "firstName lastName email phone")
      .select(
        "studentId firstName middleName lastName dateOfBirth gender admissionDate profileImage academicSession schoolClass parent isActive"
      );

    if (!student) {
      return res.status(404).json({
        message: "Child not found.",
      });
    }

    return res.status(200).json({
      message: "Child details retrieved successfully.",
      child: student,
    });
  } catch (error) {
    console.error("Get my child error:", error);

    return res.status(500).json({
      message: "Server error while retrieving child details.",
    });
  }
};

export const getMyChildResults = async (req, res) => {
  try {
    const schoolId = req.user?.school?._id || req.user?.school;

    const { studentId } = req.params;
    const { academicSession, academicTerm } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    // Make sure this student actually belongs to the logged-in parent.
    const student = await Student.findOne({
      _id: studentId,
      parent: req.user._id,
      school: schoolId,
    });

    if (!student) {
      return res.status(404).json({
        message:
          "Child not found or you are not authorized to access this student.",
      });
    }

    const resultFilter = {
      school: schoolId,
      student: student._id,
      status: {
        $in: ["published", "locked"],
      },
    };

    if (academicSession) {
      resultFilter.academicSession = academicSession;
    }

    if (academicTerm) {
      resultFilter.academicTerm = academicTerm;
    }

    const results = await Result.find(resultFilter)
      .populate("subject", "name code")
      .populate("schoolClass", "name arm section")
      .populate(
        "academicSession",
        "name startDate endDate"
      )
      .populate(
        "academicTerm",
        "name startDate endDate"
      )
      .sort({
        academicSession: 1,
        academicTerm: 1,
      });

    const totalSubjects = results.length;

    const totalScore = results.reduce(
  (sum, result) => sum + (result.total || 0),
  0
);

    const averageScore =
      totalSubjects > 0
        ? Number((totalScore / totalSubjects).toFixed(2))
        : 0;

    return res.status(200).json({
      message: "Child results retrieved successfully.",
      student: {
        _id: student._id,
        studentId: student.studentId,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
      },
      summary: {
        totalSubjects,
        totalScore,
        averageScore,
      },
      results,
    });
  } catch (error) {
    console.error("Get child results error:", error);

    return res.status(500).json({
      message: "Server error while retrieving child results.",
    });
  }
};

export const getMyChildFees = async (req, res) => {
  try {
    const schoolId = req.user?.school?._id || req.user?.school;

    const { studentId } = req.params;
    const { academicSession, academicTerm, status } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    // Verify that this student belongs to the logged-in parent
    // and to the same school.
    const student = await Student.findOne({
      _id: studentId,
      parent: req.user._id,
      school: schoolId,
    });

    if (!student) {
      return res.status(404).json({
        message:
          "Child not found or you are not authorized to access this student.",
      });
    }

    const feeFilter = {
      school: schoolId,
      student: student._id,
      isActive: true,
    };

    if (academicSession) {
      feeFilter.academicSession = academicSession;
    }

    if (academicTerm) {
      feeFilter.academicTerm = academicTerm;
    }

    if (status) {
      feeFilter.status = status;
    }

    const feeAccounts = await StudentFeeAccount.find(feeFilter)
      .populate(
        "feeStructure",
        "name description items totalAmount"
      )
      .populate(
        "academicSession",
        "name startDate endDate"
      )
      .populate(
        "academicTerm",
        "name startDate endDate"
      )
      .sort({
        academicSession: -1,
        academicTerm: -1,
      });

    return res.status(200).json({
      message: "Child fee accounts retrieved successfully.",
      student: {
        _id: student._id,
        studentId: student.studentId,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
      },
      count: feeAccounts.length,
      feeAccounts,
    });
  } catch (error) {
    console.error("Get child fees error:", error);

    return res.status(500).json({
      message: "Server error while retrieving child fee accounts.",
    });
  }
};

export const getMyChildPayments = async (req, res) => {
  try {
    const schoolId = req.user?.school?._id || req.user?.school;

    const { studentId } = req.params;
    const {
      academicSession,
      academicTerm,
      status,
    } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    // Verify that this student belongs to the logged-in parent
    // and to the same school.
    const student = await Student.findOne({
      _id: studentId,
      parent: req.user._id,
      school: schoolId,
    });

    if (!student) {
      return res.status(404).json({
        message:
          "Child not found or you are not authorized to access this student.",
      });
    }

    // Find this child's fee accounts first.
    const feeAccounts = await StudentFeeAccount.find({
      school: schoolId,
      student: student._id,
    }).select("_id");

    const feeAccountIds = feeAccounts.map(
      (feeAccount) => feeAccount._id
    );

    const paymentFilter = {
      school: schoolId,
      studentFeeAccount: { $in: feeAccountIds },
      type: "school_fees",
    };

    if (academicSession) {
      paymentFilter.academicSession = academicSession;
    }

    if (academicTerm) {
      paymentFilter.academicTerm = academicTerm;
    }

    if (status) {
      paymentFilter.status = status;
    }

    const payments = await Payment.find(paymentFilter)
      .populate(
        "studentFeeAccount",
        "totalAmountDue amountPaid balance status"
      )
      .populate(
        "academicSession",
        "name startDate endDate"
      )
      .populate(
        "academicTerm",
        "name startDate endDate"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Child payment history retrieved successfully.",
      student: {
        _id: student._id,
        studentId: student.studentId,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
      },
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Get child payments error:", error);

    return res.status(500).json({
      message:
        "Server error while retrieving child payment history.",
    });
  }
};
