
import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import School from "./models/School.js";

import authRoutes from "./routes/authRoutes.js";
import schoolRoutes from "./routes/schoolRoutes.js";
import schoolAdminRoutes from "./routes/schoolAdminRoutes.js";
import academicSessionRoutes from "./routes/academicSessionRoutes.js";
import academicTermRoutes from "./routes/academicTermRoutes.js";
import schoolClassRoutes from "./routes/schoolClassRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import teacherRoutes from "./routes/teacherRoutes.js";
import subjectRoutes from "./routes/subjectRoutes.js";
import subjectAssignmentRoutes from "./routes/subjectAssignmentRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import studentPortalRoutes from "./routes/studentPortalRoutes.js";
import resultRoutes from "./routes/resultRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import parentRoutes from "./routes/parentRoutes.js";
import feeStructureRoutes from "./routes/feeStructureRoutes.js";
import studentFeeAccountRoutes from "./routes/studentFeeAccountRoutes.js";
import parentPaymentRoutes from "./routes/parentPaymentRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import publicSchoolRoutes from "./routes/publicSchoolRoutes.js";
import schoolPostRoutes from "./routes/schoolPostRoutes.js";
import superAdminRoutes from "./routes/superAdminRoutes.js";
import classTeacherRemarkRoutes from "./routes/classTeacherRemarkRoutes.js";

const app = express();

 // CORS
const allowedOrigins = [
  "https://www.school-pilot.app",
  "https://school-pilot.app",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: async (origin, callback) => {
      // Allow requests without an Origin header, such as server-to-server calls.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Custom school websites are allowed only after their domain is verified.
      try {
        const hostname = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
        if (!hostname || hostname === "school-pilot.app") {
          return callback(new Error("Not allowed by CORS"));
        }

        await connectDB();
        const schoolOwnsVerifiedDomain = await School.exists({
          "website.customDomain": { $in: [hostname, `www.${hostname}`] },
          "website.customDomainVerified": true,
          "website.enabled": true,
          isActive: true,
        });

        if (schoolOwnsVerifiedDomain) {
          return callback(null, true);
        }
      } catch (error) {
        console.error("Custom-domain CORS check failed:", error.message);
      }

      console.error(`CORS blocked origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);


// Paystack webhook must receive the raw body for signature verification.
// Keep this before express.json().
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" })
);

// Parse JSON for other requests.
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.originalUrl);
  next();
});

// Ensure MongoDB is connected before handling API requests.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection failed:", error.message);

    return res.status(503).json({
      message: "Database connection is temporarily unavailable.",
    });
  }
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/school-admins", schoolAdminRoutes);
app.use("/api/academic-sessions", academicSessionRoutes);
app.use("/api/academic-terms", academicTermRoutes);
app.use("/api/classes", schoolClassRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/subject-assignments", subjectAssignmentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/student-portal", studentPortalRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/parents", parentRoutes);
app.use("/api/fee-structures", feeStructureRoutes);
app.use("/api/student-fee-accounts", studentFeeAccountRoutes);
app.use("/api/parent-payments", parentPaymentRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/users", userRoutes);
app.use("/api/public", publicSchoolRoutes);
app.use("/api/public", schoolPostRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/class-teacher-remarks", classTeacherRemarkRoutes);

// Export the app for Vercel.
export default app;

// Start the standalone server for local development.
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
