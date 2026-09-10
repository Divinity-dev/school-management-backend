import bcrypt from "bcrypt";
import User from "../models/User.js";
import School from "../models/School.js";

export const createSchoolAdmin = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      schoolId,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !password ||
      !schoolId
    ) {
      return res.status(400).json({
        message: "Please provide all required fields",
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

    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    if (!school.isActive) {
      return res.status(403).json({
        message: "This school is currently inactive",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const schoolAdmin = await User.create({
      firstName,
      lastName,
      email: normalizedEmail,
      password: hashedPassword,
      role: "schoolAdmin",
      school: school._id,
      phone,
      isEmailVerified: false,
    });

    res.status(201).json({
      message: "School admin created successfully",
      user: {
        id: schoolAdmin._id,
        firstName: schoolAdmin.firstName,
        lastName: schoolAdmin.lastName,
        email: schoolAdmin.email,
        role: schoolAdmin.role,
        school: schoolAdmin.school,
      },
    });
  } catch (error) {
    console.error("Create school admin error:", error);

    res.status(500).json({
      message: "Server error while creating school admin",
    });
  }
};