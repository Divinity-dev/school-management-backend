import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import School from "../models/School.js";

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN,
    }
  );
};

// Existing student registration
export const register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      schoolId,
      phone,
    } = req.body;

    if (!firstName || !lastName || !email || !password || !schoolId) {
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

    const user = await User.create({
      firstName,
      lastName,
      email: normalizedEmail,
      password: hashedPassword,
      role: "student",
      school: school._id,
      phone,
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        school: user.school,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      message: "Server error during registration",
    });
  }
};

// New SaaS onboarding for school administrators
export const registerSchool = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      school: schoolData,
      admin: adminData,
    } = req.body;

    if (!schoolData || !adminData) {
      return res.status(400).json({
        message: "School and admin information are required",
      });
    }

    const {
      name: schoolName,
      email: schoolEmail,
      phone: schoolPhone,
      address,
      city,
      state,
      country,
      logo,
    } = schoolData;

    const {
      firstName,
      lastName,
      email: adminEmail,
      password,
      phone: adminPhone,
    } = adminData;

    if (
      !schoolName ||
      !schoolEmail ||
      !firstName ||
      !lastName ||
      !adminEmail ||
      !password
    ) {
      return res.status(400).json({
        message:
          "School name, school email, admin name, admin email, and password are required",
      });
    }

    const normalizedSchoolEmail = schoolEmail.toLowerCase().trim();
    const normalizedAdminEmail = adminEmail.toLowerCase().trim();

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const existingSchool = await School.findOne({
      email: normalizedSchoolEmail,
    });

    if (existingSchool) {
      return res.status(400).json({
        message: "A school with this email already exists",
      });
    }

    const existingUser = await User.findOne({
      email: normalizedAdminEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        message: "A user with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    let createdSchool;
    let createdAdmin;

    await session.withTransaction(async () => {
      const schools = await School.create(
        [
          {
            name: schoolName.trim(),
            email: normalizedSchoolEmail,
            phone: schoolPhone,
            address,
            city,
            state,
            country: country || "Nigeria",
            logo: logo || "",
          },
        ],
        { session }
      );

      createdSchool = schools[0];

      const admins = await User.create(
        [
          {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: normalizedAdminEmail,
            password: hashedPassword,
            role: "schoolAdmin",
            school: createdSchool._id,
            phone: adminPhone,
            isEmailVerified: false,
            isActive: true,
          },
        ],
        { session }
      );

      createdAdmin = admins[0];
    });

    const token = generateToken(createdAdmin._id);

    return res.status(201).json({
      message: "School account created successfully",
      token,
      school: {
        id: createdSchool._id,
        name: createdSchool.name,
        email: createdSchool.email,
        phone: createdSchool.phone,
        address: createdSchool.address,
        city: createdSchool.city,
        state: createdSchool.state,
        country: createdSchool.country,
        isActive: createdSchool.isActive,
      },
      user: {
        id: createdAdmin._id,
        firstName: createdAdmin.firstName,
        lastName: createdAdmin.lastName,
        email: createdAdmin.email,
        role: createdAdmin.role,
        school: createdAdmin.school,
      },
    });
  } catch (error) {
    console.error("School registration error:", error);

    return res.status(500).json({
      message: "Server error during school registration",
    });
  } finally {
    await session.endSession();
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    }).populate("school", "name");

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "Your account has been deactivated",
      });
    }

    if (user.school && !user.school.isActive) {
      return res.status(403).json({
        message: "This school is currently inactive",
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        school: user.school,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Server error during login",
    });
  }
};