import dotenv from "dotenv";
import express from "express";
import connectDB from "./config/db.js";
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

dotenv.config();

const app = express();

app.use(express.json());

// routes

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

connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});




