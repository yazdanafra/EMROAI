// server.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import connectDB from "./config/mongodb.js";
import connectCloudinary from "./config/cloudinary.js"; // <= new
import adminRouter from "./routes/adminRoute.js";
import doctorRouter from "./routes/doctorRoute.js";
import userRouter from "./routes/userRoute.js";
import medicalRecordRouter from "./routes/medicalRecordRoutes.js"; // <= new

const app = express();
const port = process.env.PORT || 4000;

// configure cloudinary (call the function)
connectCloudinary();

// middlewares
app.use(express.json());
app.use(cors());

//API Endpoints
app.use("/api/admin", adminRouter);
app.use("/api/doctor", doctorRouter);
app.use("/api/user", userRouter);

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
