import StudentFeeAccount from "../models/StudentFeeAccount.js";
import Student from "../models/Student.js";
import FeeStructure from "../models/FeeStructure.js";
import mongoose from "mongoose";

const getSchoolId = (req) => {
  return req.user?.school?._id || req.user?.school;
};

// ======================================================
// CREATE STUDENT FEE ACCOUNT
// ======================================================
export const createStudentFeeAccount = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const { studentId, feeStructureId } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    if (!studentId || !feeStructureId) {
      return res.status(400).json({
        message: "Student and fee structure are required.",
      });
    }

    // Find student and ensure the student belongs to this school
    const student = await Student.findOne({
      _id: studentId,
      school: schoolId,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student not found in this school.",
      });
    }

    // Find fee structure and ensure it belongs to this school
    const feeStructure = await FeeStructure.findOne({
      _id: feeStructureId,
      school: schoolId,
      isActive: true,
    });

    if (!feeStructure) {
      return res.status(404).json({
        message: "Active fee structure not found.",
      });
    }

    // Make sure the student's class is included
    // in the fee structure's selected classes
    const studentClassMatches = feeStructure.schoolClasses.some(
      (classId) =>
        classId.toString() === student.schoolClass.toString()
    );

    if (!studentClassMatches) {
      return res.status(400).json({
        message:
          "The student's class is not included in this fee structure.",
      });
    }

    // Make sure the student's academic session matches
    if (
      student.academicSession.toString() !==
      feeStructure.academicSession.toString()
    ) {
      return res.status(400).json({
        message:
          "The student's academic session does not match the fee structure's academic session.",
      });
    }

    // Make sure the student's academic term matches
    if (
      student.academicTerm &&
      student.academicTerm.toString() !==
        feeStructure.academicTerm.toString()
    ) {
      return res.status(400).json({
        message:
          "The student's academic term does not match the fee structure's academic term.",
      });
    }

    // Prevent duplicate fee accounts
    const existingAccount = await StudentFeeAccount.findOne({
      school: schoolId,
      student: student._id,
      feeStructure: feeStructure._id,
    });

    if (existingAccount) {
      return res.status(400).json({
        message:
          "A fee account already exists for this student and fee structure.",
      });
    }

    const totalAmountDue = feeStructure.totalAmount;

    const studentFeeAccount = await StudentFeeAccount.create({
      school: schoolId,
      student: student._id,
      feeStructure: feeStructure._id,
      academicSession: feeStructure.academicSession,
      academicTerm: feeStructure.academicTerm,
      totalAmountDue,
      amountPaid: 0,
      balance: totalAmountDue,
      status: totalAmountDue === 0 ? "paid" : "unpaid",
    });

    const populatedAccount =
      await StudentFeeAccount.findById(studentFeeAccount._id)
        .populate(
          "student",
          "studentId firstName middleName lastName"
        )
        .populate(
          "feeStructure",
          "items totalAmount isActive schoolClasses"
        )
        .populate(
          "academicSession",
          "name"
        )
        .populate(
          "academicTerm",
          "name"
        );

    return res.status(201).json({
      message: "Student fee account created successfully.",
      studentFeeAccount: populatedAccount,
    });
  } catch (error) {
    console.error(
      "Create student fee account error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while creating student fee account.",
    });
  }
};

// ======================================================
// GET ALL STUDENT FEE ACCOUNTS
// ======================================================
export const getStudentFeeAccounts = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    const {
      academicSession,
      academicTerm,
      schoolClass,
      status,
      student,
      isActive,
    } = req.query;

    const filter = {
      school: schoolId,
    };

    if (academicSession) {
      filter.academicSession = academicSession;
    }

    if (academicTerm) {
      filter.academicTerm = academicTerm;
    }

    if (schoolClass) {
      const students = await Student.find({
        school: schoolId,
        schoolClass,
      }).select("_id");

      filter.student = {
        $in: students.map((student) => student._id),
      };
    }

    if (status) {
      const allowedStatuses = [
        "unpaid",
        "partial",
        "paid",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message:
            "Invalid status. Use unpaid, partial, or paid.",
        });
      }

      filter.status = status;
    }

    if (student) {
      filter.student = student;
    }

    if (isActive !== undefined) {
      if (isActive === "true") {
        filter.isActive = true;
      } else if (isActive === "false") {
        filter.isActive = false;
      } else {
        return res.status(400).json({
          message:
            "isActive must be either true or false.",
        });
      }
    }

    const feeAccounts = await StudentFeeAccount.find(filter)
      .populate(
        "student",
        "studentId firstName middleName lastName schoolClass"
      )
      .populate(
        "feeStructure",
        "items totalAmount isActive schoolClasses"
      )
      .populate(
        "academicSession",
        "name"
      )
      .populate(
        "academicTerm",
        "name"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Student fee accounts retrieved successfully.",
      count: feeAccounts.length,
      studentFeeAccounts: feeAccounts,
    });
  } catch (error) {
    console.error(
      "Get student fee accounts error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while retrieving student fee accounts.",
    });
  }
};

// ======================================================
// GET SINGLE STUDENT FEE ACCOUNT
// ======================================================
export const getStudentFeeAccountById = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { id } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    const feeAccount = await StudentFeeAccount.findOne({
      _id: id,
      school: schoolId,
    })
      .populate(
        "student",
        "studentId firstName middleName lastName schoolClass"
      )
      .populate(
        "feeStructure",
        "items totalAmount isActive schoolClasses"
      )
      .populate(
        "academicSession",
        "name"
      )
      .populate(
        "academicTerm",
        "name"
      );

    if (!feeAccount) {
      return res.status(404).json({
        message: "Student fee account not found.",
      });
    }

    return res.status(200).json({
      message: "Student fee account retrieved successfully.",
      studentFeeAccount: feeAccount,
    });
  } catch (error) {
    console.error(
      "Get student fee account by ID error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while retrieving student fee account.",
    });
  }
};

// ======================================================
// GET STUDENT'S FEE ACCOUNTS
// ======================================================
export const getStudentFeeAccountsByStudent = async (
  req,
  res
) => {
  try {
    const schoolId = getSchoolId(req);
    const { studentId } = req.params;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    const student = await Student.findOne({
      _id: studentId,
      school: schoolId,
    }).select(
      "studentId firstName middleName lastName schoolClass academicSession academicTerm"
    );

    if (!student) {
      return res.status(404).json({
        message: "Student not found in this school.",
      });
    }

    const feeAccounts = await StudentFeeAccount.find({
      school: schoolId,
      student: studentId,
    })
      .populate(
        "feeStructure",
        "items totalAmount isActive schoolClasses"
      )
      .populate(
        "academicSession",
        "name"
      )
      .populate(
        "academicTerm",
        "name"
      )
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      message:
        "Student fee accounts retrieved successfully.",
      student,
      count: feeAccounts.length,
      studentFeeAccounts: feeAccounts,
    });
  } catch (error) {
    console.error(
      "Get student fee accounts by student error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while retrieving student's fee accounts.",
    });
  }
};

export const getOutstandingFeesReport = async (req, res) => {
  try {
    const schoolId =
      req.user?.school?._id || req.user?.school;

    if (!schoolId) {
      return res.status(400).json({
        message: "User is not associated with a school.",
      });
    }

    const {
      academicSession,
      academicTerm,
      schoolClass,
      status,
    } = req.query;

    const filter = {
      school: schoolId,
      isActive: true,
    };

    if (academicSession) {
      filter.academicSession = academicSession;
    }

    if (academicTerm) {
      filter.academicTerm = academicTerm;
    }

    if (schoolClass) {
      const students = await mongoose
        .model("Student")
        .find({
          school: schoolId,
          schoolClass,
        })
        .select("_id");

      filter.student = {
        $in: students.map((student) => student._id),
      };
    }

    if (status) {
      const allowedStatuses = [
        "unpaid",
        "partial",
        "paid",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message:
            "Invalid status. Use unpaid, partial, or paid.",
        });
      }

      filter.status = status;
    }

    const accounts = await StudentFeeAccount.find(filter)
      .populate({
        path: "student",
        select:
          "studentId firstName middleName lastName schoolClass",
        populate: {
          path: "schoolClass",
          select: "name arm section",
        },
      })
      .populate(
        "feeStructure",
        "items totalAmount isActive schoolClasses"
      )
      .populate(
        "academicSession",
        "name"
      )
      .populate(
        "academicTerm",
        "name"
      )
      .sort({
        createdAt: -1,
      });

    const summary = accounts.reduce(
      (result, account) => {
        result.totalExpected += Number(
          account.totalAmountDue || 0
        );

        result.totalCollected += Number(
          account.amountPaid || 0
        );

        result.totalOutstanding += Number(
          account.balance || 0
        );

        result.totalStudents += 1;

        if (account.status === "unpaid") {
          result.unpaidStudents += 1;
        }

        if (account.status === "partial") {
          result.partiallyPaidStudents += 1;
        }

        if (account.status === "paid") {
          result.fullyPaidStudents += 1;
        }

        return result;
      },
      {
        totalExpected: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        totalStudents: 0,
        unpaidStudents: 0,
        partiallyPaidStudents: 0,
        fullyPaidStudents: 0,
      }
    );

    return res.status(200).json({
      message:
        "Outstanding fees report retrieved successfully.",
      summary,
      accounts,
    });
  } catch (error) {
    console.error(
      "Get outstanding fees report error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while retrieving outstanding fees report.",
    });
  }
};