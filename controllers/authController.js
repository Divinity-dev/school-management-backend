import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import User from "../models/User.js";
import School from "../models/School.js";

import { sendEmail } from "../utils/sendEmail.js";


const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN,
    }
  );
};

const generateEmailVerificationToken = () => {
  const rawToken = crypto.randomBytes(32).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  return {
    rawToken,
    hashedToken,
  };
};

const generatePasswordResetOtp = () => {
  return crypto.randomInt(100000, 1000000).toString();
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

// School registration
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

    // Generate email verification token
    const {
      rawToken: verificationToken,
      hashedToken: hashedVerificationToken,
    } = generateEmailVerificationToken();

    // Token expires after 24 hours
    const verificationTokenExpires = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );

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
            emailVerificationToken: hashedVerificationToken,
            emailVerificationExpires: verificationTokenExpires,

            isActive: true,
          },
        ],
        { session }
      );

      createdAdmin = admins[0];
    });

    // Verification link
    const verificationUrl =
      `${process.env.BACKEND_URL}/api/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(
        createdAdmin.email
      )}`;

    // Send verification email
    await sendEmail({
      to: createdAdmin.email,
      subject: "Verify your SchoolManager account",
      html: `
        <div style="
          font-family: Arial, Helvetica, sans-serif;
          background-color: #f6f8f7;
          padding: 40px 20px;
          color: #172322;
        ">

          <div style="
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid #e4e8e6;
          ">

            <div style="
              background: #173C37;
              padding: 30px;
              text-align: center;
            ">

              <h1 style="
                margin: 0;
                color: #ffffff;
                font-size: 28px;
              ">
                SchoolManager
              </h1>

              <p style="
                margin: 8px 0 0;
                color: #63E6BE;
                font-size: 14px;
              ">
                Manage your school with confidence
              </p>

            </div>

            <div style="padding: 35px 30px;">

              <p style="font-size: 16px;">
                Hello ${createdAdmin.firstName},
              </p>

              <h2 style="
                color: #173C37;
                font-size: 22px;
                margin-top: 25px;
              ">
                Welcome to SchoolManager
              </h2>

              <p style="
                color: #5f6d68;
                line-height: 1.7;
                font-size: 15px;
              ">
                Your school administrator account for
                <strong>${createdSchool.name}</strong>
                has been created successfully.
              </p>

              <p style="
                color: #5f6d68;
                line-height: 1.7;
                font-size: 15px;
              ">
                Before you can log in, please verify your email
                address by clicking the button below.
              </p>

              <div style="
                text-align: center;
                margin: 30px 0;
              ">

                <a
                  href="${verificationUrl}"
                  style="
                    display: inline-block;
                    background: #173C37;
                    color: #ffffff;
                    text-decoration: none;
                    padding: 14px 26px;
                    border-radius: 10px;
                    font-weight: bold;
                    font-size: 15px;
                  "
                >
                  Verify Now
                </a>

              </div>

              <div style="
                background: #E1F5ED;
                border-radius: 12px;
                padding: 20px;
                margin-top: 30px;
              ">

                <h3 style="
                  margin-top: 0;
                  color: #173C37;
                  font-size: 17px;
                ">
                  Getting started
                </h3>

                <ol style="
                  color: #53635e;
                  line-height: 1.8;
                  padding-left: 20px;
                  font-size: 14px;
                ">

                  <li>Verify your email address.</li>
                  <li>Log in to your school administrator account.</li>
                  <li>Set up your academic sessions and terms.</li>
                  <li>Add teachers, students and parents.</li>
                  <li>Start managing your school.</li>

                </ol>

              </div>

              <p style="
                color: #7b8783;
                font-size: 13px;
                line-height: 1.6;
                margin-top: 30px;
              ">
                This verification link will expire in
                <strong>24 hours</strong>.
              </p>

              <p style="
                color: #7b8783;
                font-size: 13px;
                line-height: 1.6;
              ">
                If you did not create this account, you can safely
                ignore this email.
              </p>

              <p style="
                margin-top: 30px;
                color: #53635e;
                line-height: 1.6;
              ">
                Best regards,<br />
                <strong>The SchoolManager Team</strong>
              </p>

            </div>

            <div style="
              background: #f6f8f7;
              padding: 20px 30px;
              text-align: center;
            ">

              <p style="
                margin: 0;
                color: #8a9591;
                font-size: 12px;
              ">
                © ${new Date().getFullYear()}
                SchoolManager. All rights reserved.
              </p>

            </div>

          </div>

        </div>
      `,
    });

    return res.status(201).json({
      message:
        "School account created successfully. Please check your email to verify your account.",
      emailVerificationRequired: true,
      school: {
        id: createdSchool._id,
        name: createdSchool.name,
        email: createdSchool.email,
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

// Verify school administrator email
export const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verification=invalid`
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      email: normalizedEmail,
      role: "schoolAdmin",
    });

    if (!user) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verification=not-found`
      );
    }

    if (user.isEmailVerified) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verified=already`
      );
    }

    if (
      !user.emailVerificationToken ||
      !user.emailVerificationExpires
    ) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verification=invalid`
      );
    }

    if (user.emailVerificationExpires < new Date()) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verification=expired`
      );
    }

    if (user.emailVerificationToken !== hashedToken) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?verification=invalid`
      );
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;

    await user.save();

    return res.redirect(
      `${process.env.CLIENT_URL}/login?verified=true`
    );
  } catch (error) {
    console.error("Verify email error:", error);

    return res.redirect(
      `${process.env.CLIENT_URL}/login?verification=error`
    );
  }
};

// Login
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
    }).populate("school", "name isActive");

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

    // Email verification is required only for school admins
    // created through public school registration.
    if (
      user.role === "schoolAdmin" &&
      !user.isEmailVerified
    ) {
      return res.status(403).json({
        message:
          "Please verify your email address before logging in.",
        emailVerificationRequired: true,
        code: "EMAIL_NOT_VERIFIED",
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

// Forgot password
// Forgot password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    // Do not reveal whether the email exists
    if (!user) {
      return res.status(200).json({
        message:
          "If an account with that email exists, a verification code has been sent.",
      });
    }

    // Generate 6-digit OTP
    const otp = generatePasswordResetOtp();

    // Hash OTP before storing it
    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    // OTP expires after 10 minutes
    const passwordResetExpires = new Date(
      Date.now() + 10 * 60 * 1000
    );

    user.passwordResetToken = hashedOtp;
    user.passwordResetExpires = passwordResetExpires;

    await user.save();

    // Send OTP email
    await sendEmail({
      to: user.email,
      subject: "Your SchoolManager password reset code",
      html: `
        <div style="
          font-family: Arial, Helvetica, sans-serif;
          background-color: #f6f8f7;
          padding: 40px 20px;
          color: #172322;
        ">

          <div style="
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid #e4e8e6;
          ">

            <div style="
              background: #173C37;
              padding: 30px;
              text-align: center;
            ">

              <h1 style="
                margin: 0;
                color: #ffffff;
                font-size: 28px;
              ">
                SchoolManager
              </h1>

              <p style="
                margin: 8px 0 0;
                color: #63E6BE;
                font-size: 14px;
              ">
                Manage your school with confidence
              </p>

            </div>

            <div style="padding: 35px 30px;">

              <p style="font-size: 16px;">
                Hello ${user.firstName},
              </p>

              <h2 style="
                color: #173C37;
                font-size: 22px;
                margin-top: 25px;
              ">
                Reset your password
              </h2>

              <p style="
                color: #5f6d68;
                line-height: 1.7;
                font-size: 15px;
              ">
                We received a request to reset the password for your
                SchoolManager account.
              </p>

              <p style="
                color: #5f6d68;
                line-height: 1.7;
                font-size: 15px;
              ">
                Enter the verification code below in the password
                reset window:
              </p>

              <div style="
                text-align: center;
                margin: 30px 0;
              ">

                <div style="
                  display: inline-block;
                  background: #E1F5ED;
                  color: #173C37;
                  padding: 18px 30px;
                  border-radius: 12px;
                  font-size: 32px;
                  font-weight: bold;
                  letter-spacing: 8px;
                ">
                  ${otp}
                </div>

              </div>

              <div style="
                background: #E1F5ED;
                border-radius: 12px;
                padding: 20px;
                margin-top: 30px;
              ">

                <p style="
                  margin: 0;
                  color: #53635e;
                  line-height: 1.7;
                  font-size: 14px;
                ">
                  This verification code will expire in
                  <strong>10 minutes</strong>.
                </p>

              </div>

              <p style="
                color: #7b8783;
                font-size: 13px;
                line-height: 1.6;
                margin-top: 30px;
              ">
                If you did not request a password reset, you can safely
                ignore this email. Your current password will remain
                unchanged.
              </p>

              <p style="
                margin-top: 30px;
                color: #53635e;
                line-height: 1.6;
              ">
                Best regards,<br />
                <strong>The SchoolManager Team</strong>
              </p>

            </div>

            <div style="
              background: #f6f8f7;
              padding: 20px 30px;
              text-align: center;
            ">

              <p style="
                margin: 0;
                color: #8a9591;
                font-size: 12px;
              ">
                © ${new Date().getFullYear()}
                SchoolManager. All rights reserved.
              </p>

            </div>

          </div>

        </div>
      `,
    });

    return res.status(200).json({
      message:
        "If an account with that email exists, a verification code has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);

    return res.status(500).json({
      message: "Server error while processing password reset request",
    });
  }
};

// Reset password
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        message: "Reset token and new password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: {
        $gt: new Date(),
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "This password reset link is invalid or has expired",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    user.password = hashedPassword;

    // Invalidate the reset token immediately
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    await user.save();

    return res.status(200).json({
      message:
        "Password reset successful. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);

    return res.status(500).json({
      message: "Server error while resetting password",
    });
  }
};

export const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and verification code are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp.toString())
      .digest("hex");

    const user = await User.findOne({
      email: normalizedEmail,
      passwordResetToken: hashedOtp,
      passwordResetExpires: {
        $gt: new Date(),
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired verification code",
      });
    }

    return res.status(200).json({
  message: "Verification code confirmed",
});
  } catch (error) {
    console.error("Verify reset OTP error:", error);

    return res.status(500).json({
      message: "Server error while verifying the code",
    });
  }
};