import SchoolClass from "../models/SchoolClass.js";
import AcademicSession from "../models/AcademicSession.js";
import User from "../models/User.js";

// @desc    Create school class
// @route   POST /api/classes
// @access  Private - School Admin
export const createSchoolClass = async (req, res) => {
  try {
    const {
      academicSession,
      name,
      arm,
      section,
      classTeacher,
    } = req.body;

    if (!academicSession || !name || !section) {
      return res.status(400).json({
        message: "Academic session, class name and section are required",
      });
    }

    // Make sure the academic session belongs to this school
    const session = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    // Validate class teacher if provided
    if (classTeacher) {
      const teacher = await User.findOne({
        _id: classTeacher,
        school: req.user.school,
        role: "teacher",
        isActive: true,
      });

      if (!teacher) {
        return res.status(400).json({
          message: "Invalid or inactive class teacher",
        });
      }
    }

    // Prevent duplicate class
    const existingClass = await SchoolClass.findOne({
      school: req.user.school,
      academicSession,
      name: name.trim(),
      arm: arm?.trim().toUpperCase() || "",
    });

    if (existingClass) {
      return res.status(400).json({
        message: "This class already exists for this academic session",
      });
    }

    const schoolClass = await SchoolClass.create({
      school: req.user.school,
      academicSession,
      name: name.trim(),
      arm: arm?.trim().toUpperCase() || "",
      section,
      classTeacher: classTeacher || null,
    });

    res.status(201).json({
      message: "Class created successfully",
      schoolClass,
    });
  } catch (error) {
    console.error("Create school class error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get all classes for school
// @route   GET /api/classes
// @access  Private
export const getSchoolClasses = async (req, res) => {
  try {
    const classes = await SchoolClass.find({
      school: req.user.school,
    })
      .populate("academicSession", "name startDate endDate")
      .populate("classTeacher", "firstName lastName email")
      .sort({ name: 1, arm: 1 });

    res.status(200).json({
      classes,
    });
  } catch (error) {
    console.error("Get school classes error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get classes by academic session
// @route   GET /api/classes/session/:sessionId
// @access  Private
export const getClassesBySession = async (req, res) => {
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

    const classes = await SchoolClass.find({
      school: req.user.school,
      academicSession: session._id,
      isActive: true,
    })
      .populate("classTeacher", "firstName lastName email")
      .sort({ name: 1, arm: 1 });

    res.status(200).json({
      classes,
    });
  } catch (error) {
    console.error("Get classes by session error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get single class
// @route   GET /api/classes/:id
// @access  Private
export const getSchoolClass = async (req, res) => {
  try {
    const schoolClass = await SchoolClass.findOne({
      _id: req.params.id,
      school: req.user.school,
    })
      .populate("academicSession", "name startDate endDate")
      .populate("classTeacher", "firstName lastName email");

    if (!schoolClass) {
      return res.status(404).json({
        message: "Class not found",
      });
    }

    res.status(200).json({
      schoolClass,
    });
  } catch (error) {
    console.error("Get school class error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Update school class
// @route   PUT /api/classes/:id
// @access  Private - School Admin
export const updateSchoolClass = async (req, res) => {
  try {
    const {
      academicSession,
      name,
      arm,
      section,
      classTeacher,
      isActive,
    } = req.body;

    const schoolClass = await SchoolClass.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!schoolClass) {
      return res.status(404).json({
        message: "Class not found",
      });
    }

    const targetSessionId =
      academicSession !== undefined
        ? academicSession
        : schoolClass.academicSession;

    // Validate academic session
    const session = await AcademicSession.findOne({
      _id: targetSessionId,
      school: req.user.school,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    const targetName =
      name !== undefined ? name.trim() : schoolClass.name;

    const targetArm =
      arm !== undefined
        ? arm.trim().toUpperCase()
        : schoolClass.arm;

    // Prevent duplicate class
    const duplicateClass = await SchoolClass.findOne({
      school: req.user.school,
      academicSession: targetSessionId,
      name: targetName,
      arm: targetArm,
      _id: { $ne: schoolClass._id },
    });

    if (duplicateClass) {
      return res.status(400).json({
        message: "This class already exists for this academic session",
      });
    }

    // Validate class teacher if provided
    if (classTeacher !== undefined && classTeacher !== null) {
      const teacher = await User.findOne({
        _id: classTeacher,
        school: req.user.school,
        role: "teacher",
        isActive: true,
      });

      if (!teacher) {
        return res.status(400).json({
          message: "Invalid or inactive class teacher",
        });
      }
    }

    if (academicSession !== undefined) {
      schoolClass.academicSession = academicSession;
    }

    if (name !== undefined) {
      schoolClass.name = targetName;
    }

    if (arm !== undefined) {
      schoolClass.arm = targetArm;
    }

    if (section !== undefined) {
      schoolClass.section = section;
    }

    if (classTeacher !== undefined) {
      schoolClass.classTeacher = classTeacher;
    }

    if (isActive !== undefined) {
      schoolClass.isActive = isActive;

      // An inactive class should not have an active class teacher assignment
      if (isActive === false) {
        schoolClass.classTeacher = null;
      }
    }

    await schoolClass.save();

    res.status(200).json({
      message: "Class updated successfully",
      schoolClass,
    });
  } catch (error) {
    console.error("Update school class error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Deactivate school class
// @route   PATCH /api/classes/:id/deactivate
// @access  Private - School Admin
export const deactivateSchoolClass = async (req, res) => {
  try {
    const schoolClass = await SchoolClass.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!schoolClass) {
      return res.status(404).json({
        message: "Class not found",
      });
    }

    schoolClass.isActive = false;
    schoolClass.classTeacher = null;

    await schoolClass.save();

    res.status(200).json({
      message: "Class deactivated successfully",
      schoolClass,
    });
  } catch (error) {
    console.error("Deactivate school class error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};