import bcrypt from "bcrypt";
import User from "../models/User.js";

// @desc    Create teacher
// @route   POST /api/teachers
// @access  Private - School Admin
export const createTeacher = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      profileImage,
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        message:
          "First name, last name, email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        message: "A user with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const teacher = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: "teacher",
      school: req.user.school,
      phone: phone?.trim() || "",
      profileImage: profileImage || "",
    });

    const teacherResponse = teacher.toObject();
    delete teacherResponse.password;

    res.status(201).json({
      message: "Teacher created successfully",
      teacher: teacherResponse,
    });
  } catch (error) {
    console.error("Create teacher error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get all teachers in school
// @route   GET /api/teachers
// @access  Private
export const getTeachers = async (req, res) => {
  try {
    const teachers = await User.find({
      school: req.user.school,
      role: "teacher",
    })
      .select("-password")
      .sort({ lastName: 1, firstName: 1 });

    res.status(200).json({
      teachers,
    });
  } catch (error) {
    console.error("Get teachers error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get single teacher
// @route   GET /api/teachers/:id
// @access  Private
export const getTeacher = async (req, res) => {
  try {
    const teacher = await User.findOne({
      _id: req.params.id,
      school: req.user.school,
      role: "teacher",
    }).select("-password");

    if (!teacher) {
      return res.status(404).json({
        message: "Teacher not found",
      });
    }

    res.status(200).json({
      teacher,
    });
  } catch (error) {
    console.error("Get teacher error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Update teacher
// @route   PUT /api/teachers/:id
// @access  Private - School Admin
export const updateTeacher = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      profileImage,
      isActive,
    } = req.body;

    const teacher = await User.findOne({
      _id: req.params.id,
      school: req.user.school,
      role: "teacher",
    });

    if (!teacher) {
      return res.status(404).json({
        message: "Teacher not found",
      });
    }

    // Check email uniqueness if changed
    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase().trim();

      const existingUser = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: teacher._id },
      });

      if (existingUser) {
        return res.status(400).json({
          message: "A user with this email already exists",
        });
      }

      teacher.email = normalizedEmail;
    }

    if (firstName !== undefined) {
      teacher.firstName = firstName.trim();
    }

    if (lastName !== undefined) {
      teacher.lastName = lastName.trim();
    }

    if (phone !== undefined) {
      teacher.phone = phone.trim();
    }

    if (profileImage !== undefined) {
      teacher.profileImage = profileImage;
    }

    if (isActive !== undefined) {
      teacher.isActive = isActive;
    }

    await teacher.save();

    const teacherResponse = teacher.toObject();
    delete teacherResponse.password;

    res.status(200).json({
      message: "Teacher updated successfully",
      teacher: teacherResponse,
    });
  } catch (error) {
    console.error("Update teacher error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Deactivate teacher
// @route   PATCH /api/teachers/:id/deactivate
// @access  Private - School Admin
export const deactivateTeacher = async (req, res) => {
  try {
    const teacher = await User.findOne({
      _id: req.params.id,
      school: req.user.school,
      role: "teacher",
    });

    if (!teacher) {
      return res.status(404).json({
        message: "Teacher not found",
      });
    }

    teacher.isActive = false;

    await teacher.save();

    res.status(200).json({
      message: "Teacher deactivated successfully",
      teacher: {
        _id: teacher._id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        email: teacher.email,
        isActive: teacher.isActive,
      },
    });
  } catch (error) {
    console.error("Deactivate teacher error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};