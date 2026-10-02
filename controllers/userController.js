import bcrypt from "bcrypt";

import User from "../models/User.js";


// Get currently authenticated user's profile
export const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password -emailVerificationToken -emailVerificationExpires -passwordResetToken -passwordResetExpires")
      .populate("school", "name email phone address city state country logo");

    if (!user) {
      return res.status(404).json({
        message: "User profile not found",
      });
    }

    return res.status(200).json({
      user,
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      message: "Server error while loading profile",
    });
  }
};


// Update currently authenticated user's profile
export const updateMyProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
    } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({
        message: "First name and last name are required",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "User profile not found",
      });
    }

    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.phone = phone?.trim() || "";

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select("-password -emailVerificationToken -emailVerificationExpires -passwordResetToken -passwordResetExpires")
      .populate("school", "name email phone address city state country logo");

    return res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      message: "Server error while updating profile",
    });
  }
};


// Change currently authenticated user's password
export const changeMyPassword = async (req, res) => {
  try {
    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body;

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      return res.status(400).json({
        message:
          "Current password, new password and password confirmation are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message:
          "New password must be at least 8 characters long",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New passwords do not match",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "User profile not found",
      });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!passwordMatches) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    const samePassword = await bcrypt.compare(
      newPassword,
      user.password
    );

    if (samePassword) {
      return res.status(400).json({
        message:
          "New password must be different from your current password",
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);

    await user.save();

    return res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);

    return res.status(500).json({
      message: "Server error while changing password",
    });
  }
};