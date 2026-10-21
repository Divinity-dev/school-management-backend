import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

import User from "../models/User.js";

const createSuperAdmin = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not defined in your .env file");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("Connected to MongoDB");

    const email = "divine_asiriuwa@yahoo.com";

    // Check whether this email already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log("\nA user with this email already exists.");
      console.log({
        id: existingUser._id.toString(),
        email: existingUser.email,
        role: existingUser.role,
      });

      await mongoose.disconnect();
      return;
    }

    // Use the same bcrypt configuration as the existing auth system
    const hashedPassword = await bcrypt.hash(
      process.env.SUPER_ADMIN_PASSWORD,
      12
    );

    const superAdmin = await User.create({
      firstName: "Divine",
      lastName: "Asiriuwa",
      email,
      password: hashedPassword,
      role: "superAdmin",
      school: null,
      isActive: true,
      isEmailVerified: true,
    });

    console.log("\n=================================");
    console.log("SUPER ADMIN CREATED SUCCESSFULLY");
    console.log("=================================");
    console.log(`Name: ${superAdmin.firstName} ${superAdmin.lastName}`);
    console.log(`Email: ${superAdmin.email}`);
    console.log(`Role: ${superAdmin.role}`);
    console.log(`ID: ${superAdmin._id}`);
    console.log("=================================\n");

    await mongoose.disconnect();

    console.log("Disconnected from MongoDB");
  } catch (error) {
    console.error("\nFailed to create Super Admin:");
    console.error(error);

    await mongoose.disconnect().catch(() => {});

    process.exit(1);
  }
};

createSuperAdmin();