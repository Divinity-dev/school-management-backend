import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "./models/User.js";

dotenv.config();

const teacherId = "6aa2fd2011a2e9a059daf6c5";
const newPassword = "password123";

const changePassword = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const teacher = await User.findByIdAndUpdate(
      teacherId,
      { password: hashedPassword },
      { new: true }
    );

    if (!teacher) {
      console.log("Teacher not found.");
      process.exit(1);
    }

    console.log("Teacher password changed successfully.");
    console.log("Email:", teacher.email);
    console.log("New password:", newPassword);

    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
};

changePassword();