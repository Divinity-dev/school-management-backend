import bcrypt from "bcrypt";
import User from "../models/User.js";
import School from "../models/School.js";
import generateUsername from "../utils/generateUsername.js";


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
      !firstName?.trim() ||
      !lastName?.trim() ||
      !email?.trim() ||
      !password ||
      !schoolId
    ) {
      return res.status(400).json({
        message:
          "First name, last name, email, password, and school are required",
      });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "This email address is already registered",
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

    const username = await generateUsername(
      firstName.trim(),
      lastName.trim()
    );

    const hashedPassword = await bcrypt.hash(password, 12);

    const schoolAdmin = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      username,
      email: normalizedEmail,
      password: hashedPassword,
      role: "schoolAdmin",
      school: school._id,
      phone: phone?.trim() || "",
      isEmailVerified: false,
    });

    return res.status(201).json({
      message:
        "School administrator created successfully. Email verification is required before login.",
      user: {
        id: schoolAdmin._id,
        firstName: schoolAdmin.firstName,
        lastName: schoolAdmin.lastName,
        username: schoolAdmin.username,
        email: schoolAdmin.email,
        role: schoolAdmin.role,
        school: school._id,
        isEmailVerified: schoolAdmin.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("Create school admin error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "A username or email conflict occurred. Please try again.",
      });
    }

    return res.status(500).json({
      message: "Server error while creating school administrator",
    });
  }
};
