import dotenv from "dotenv";
import express from "express";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import schoolRoutes from "./routes/schoolRoutes.js";
import schoolAdminRoutes from "./routes/schoolAdminRoutes.js";

dotenv.config();

const app = express();

app.use(express.json());

// routes

app.use("/api/auth", authRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/school-admins", schoolAdminRoutes);

connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});