import bcrypt from "bcrypt";
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const resetAdminPassword = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const email = "john.doe@divineinternationalschool.com";
    const newPassword = "password123";

    const user = await User.findOne({ email });

    if (!user) {
      console.log("School admin not found.");
      process.exit(1);
    }

    if (user.role !== "schoolAdmin") {
      console.log(`User exists but has role: ${user.role}`);
      process.exit(1);
    }

    user.password = await bcrypt.hash(newPassword, 12);

    await user.save();

    console.log("School admin password updated successfully.");
    console.log(`Email: ${email}`);
    console.log(`Password: ${newPassword}`);

    process.exit(0);
  } catch (error) {
    console.error("Password reset error:", error);
    process.exit(1);
  }
};

resetAdminPassword();

