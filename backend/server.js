// backend/server.js
import express from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import connectDB from "./config/mongodb.js";
import connectCloudinary from "./config/cloudinary.js";
import adminRouter from "./routes/adminRoute.js";
import doctorRouter from "./routes/doctorRoute.js";
import userRouter from "./routes/userRoute.js";
import medicalRecordRouter from "./routes/medicalRecordRoutes.js";
import filesRouter from "./routes/filesRoute.js";
import aiRouter from "./routes/aiRoute.js";

const app = express();
const port = process.env.PORT || 4000;

// configure cloudinary (call the function)
connectCloudinary();

// middlewares
app.use(express.json());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());

// Serve static public files so /ai_results/<runId>/overlay.png resolves.
// This exposes backend/public/... under the server root (same origin).
// If you prefer only the ai_results folder, the second line restricts it.
app.use(express.static(path.join(process.cwd(), "public"))); // serves /ai_results/<runId>/...
// OR (more explicit):
// app.use('/ai_results', express.static(path.join(process.cwd(), 'public', 'ai_results')));

// API Endpoints
app.use("/api/admin", adminRouter);
app.use("/api/doctor", doctorRouter);
app.use("/api/user", userRouter);
app.use("/api/files", filesRouter);
app.use("/api/ai", aiRouter);

// mount records routes
app.use("/api/records", medicalRecordRouter);

// health check
app.get("/", (req, res) => {
  res.send("API Working great");
});

// Start server ONLY after DB connects
(async () => {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log(`🚀 Server started on port ${port}`);
    });
  } catch (error) {
    console.error("❌ Server failed to start:", error.message);
    process.exit(1);
  }
})();
