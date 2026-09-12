import SubjectAssignment from "../models/SubjectAssignment.js";
import AcademicSession from "../models/AcademicSession.js";
import SchoolClass from "../models/SchoolClass.js";
import Subject from "../models/Subject.js";
import User from "../models/User.js";

// @desc    Assign subject to a class and teacher
// @route   POST /api/subject-assignments
// @access  Private - School Admin
export const createSubjectAssignment = async (req, res) => {
  try {
    const {
      academicSession,
      schoolClass,
      subject,
      teacher,
    } = req.body;

    if (
      !academicSession ||
      !schoolClass ||
      !subject ||
      !teacher
    ) {
      return res.status(400).json({
        message:
          "Academic session, class, subject and teacher are required",
      });
    }

    // Verify academic session belongs to the school
    const session = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
      isActive: true,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found or inactive",
      });
    }

    // Verify class belongs to the same school and session
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

    // Verify subject belongs to the same school
    const subjectRecord = await Subject.findOne({
      _id: subject,
      school: req.user.school,
      isActive: true,
    });

    if (!subjectRecord) {
      return res.status(404).json({
        message: "Subject not found or inactive",
      });
    }

    // Verify teacher belongs to the same school
    const teacherRecord = await User.findOne({
      _id: teacher,
      school: req.user.school,
      role: "teacher",
      isActive: true,
    });

    if (!teacherRecord) {
      return res.status(404).json({
        message:
          "Teacher not found, inactive, or not associated with this school",
      });
    }

    // Prevent duplicate assignment
    const existingAssignment = await SubjectAssignment.findOne({
      school: req.user.school,
      academicSession,
      schoolClass,
      subject,
    });

    if (existingAssignment) {
      return res.status(400).json({
        message:
          "This subject is already assigned to this class for the selected academic session",
      });
    }

    const assignment = await SubjectAssignment.create({
      school: req.user.school,
      academicSession,
      schoolClass,
      subject,
      teacher,
    });

    const populatedAssignment =
      await SubjectAssignment.findById(assignment._id)
        .populate("academicSession", "name startDate endDate")
        .populate("schoolClass", "name arm section")
        .populate("subject", "name code")
        .populate(
          "teacher",
          "firstName lastName email profileImage"
        );

    res.status(201).json({
      message: "Subject assigned successfully",
      assignment: populatedAssignment,
    });
  } catch (error) {
    console.error("Create subject assignment error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get all subject assignments in school
// @route   GET /api/subject-assignments
// @access  Private
export const getSubjectAssignments = async (req, res) => {
  try {
    const assignments = await SubjectAssignment.find({
      school: req.user.school,
    })
      .populate("academicSession", "name")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate(
        "teacher",
        "firstName lastName email profileImage"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      assignments,
    });
  } catch (error) {
    console.error("Get subject assignments error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get subject assignments by class
// @route   GET /api/subject-assignments/class/:classId
// @access  Private
export const getAssignmentsByClass = async (req, res) => {
  try {
    const assignments = await SubjectAssignment.find({
      school: req.user.school,
      schoolClass: req.params.classId,
    })
      .populate("academicSession", "name")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate(
        "teacher",
        "firstName lastName email profileImage"
      )
      .sort({ "subject.name": 1 });

    res.status(200).json({
      assignments,
    });
  } catch (error) {
    console.error("Get assignments by class error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get single subject assignment
// @route   GET /api/subject-assignments/:id
// @access  Private
export const getSubjectAssignment = async (req, res) => {
  try {
    const assignment = await SubjectAssignment.findOne({
      _id: req.params.id,
      school: req.user.school,
    })
      .populate("academicSession", "name startDate endDate")
      .populate("schoolClass", "name arm section")
      .populate("subject", "name code")
      .populate(
        "teacher",
        "firstName lastName email profileImage"
      );

    if (!assignment) {
      return res.status(404).json({
        message: "Subject assignment not found",
      });
    }

    res.status(200).json({
      assignment,
    });
  } catch (error) {
    console.error("Get subject assignment error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Update subject assignment
// @route   PUT /api/subject-assignments/:id
// @access  Private - School Admin
export const updateSubjectAssignment = async (req, res) => {
  try {
    const {
      subject,
      teacher,
      isActive,
    } = req.body;

    const assignment = await SubjectAssignment.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!assignment) {
      return res.status(404).json({
        message: "Subject assignment not found",
      });
    }

    if (subject !== undefined) {
      const subjectRecord = await Subject.findOne({
        _id: subject,
        school: req.user.school,
        isActive: true,
      });

      if (!subjectRecord) {
        return res.status(404).json({
          message: "Subject not found or inactive",
        });
      }

      const duplicateAssignment =
        await SubjectAssignment.findOne({
          school: req.user.school,
          academicSession: assignment.academicSession,
          schoolClass: assignment.schoolClass,
          subject,
          _id: { $ne: assignment._id },
        });

      if (duplicateAssignment) {
        return res.status(400).json({
          message:
            "This subject is already assigned to this class for the selected academic session",
        });
      }

      assignment.subject = subject;
    }

    if (teacher !== undefined) {
      const teacherRecord = await User.findOne({
        _id: teacher,
        school: req.user.school,
        role: "teacher",
        isActive: true,
      });

      if (!teacherRecord) {
        return res.status(404).json({
          message:
            "Teacher not found, inactive, or not associated with this school",
        });
      }

      assignment.teacher = teacher;
    }

    if (isActive !== undefined) {
      assignment.isActive = isActive;
    }

    await assignment.save();

    const populatedAssignment =
      await SubjectAssignment.findById(assignment._id)
        .populate("academicSession", "name startDate endDate")
        .populate("schoolClass", "name arm section")
        .populate("subject", "name code")
        .populate(
          "teacher",
          "firstName lastName email profileImage"
        );

    res.status(200).json({
      message: "Subject assignment updated successfully",
      assignment: populatedAssignment,
    });
  } catch (error) {
    console.error("Update subject assignment error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Deactivate subject assignment
// @route   PATCH /api/subject-assignments/:id/deactivate
// @access  Private - School Admin
export const deactivateSubjectAssignment = async (req, res) => {
  try {
    const assignment = await SubjectAssignment.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!assignment) {
      return res.status(404).json({
        message: "Subject assignment not found",
      });
    }

    assignment.isActive = false;

    await assignment.save();

    res.status(200).json({
      message: "Subject assignment deactivated successfully",
      assignment: {
        _id: assignment._id,
        isActive: assignment.isActive,
      },
    });
  } catch (error) {
    console.error(
      "Deactivate subject assignment error:",
      error
    );

    res.status(500).json({
      message: "Server error",
    });
  }
};