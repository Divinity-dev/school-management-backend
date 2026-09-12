import dotenv from "dotenv";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import School from "../models/School.js";

dotenv.config();

const createTestTeacher = async () => {
  try {
    await connectDB();

    const school = await School.findOne();

    if (!school) {
      console.log("No school found.");
      process.exit(1);
    }

    const email = "test.teacher@example.com";
    const password = "TestTeacher123";

    const existingTeacher = await User.findOne({ email });

    if (existingTeacher) {
      console.log("Test teacher already exists.");
      console.log(`Email: ${email}`);
      console.log(`Password: ${password}`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const teacher = await User.create({
      firstName: "Test",
      lastName: "Teacher",
      email,
      password: hashedPassword,
      role: "teacher",
      school: school._id,
      isActive: true,
      isEmailVerified: true,
    });

    console.log("Test teacher created successfully.");
    console.log({
      id: teacher._id,
      name: `${teacher.firstName} ${teacher.lastName}`,
      email: teacher.email,
      role: teacher.role,
      school: teacher.school,
    });

    process.exit(0);
  } catch (error) {
    console.error("Error creating test teacher:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
};

createTestTeacher();

