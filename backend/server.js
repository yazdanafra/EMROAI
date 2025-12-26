// server.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import connectDB from "./config/mongodb.js";
import connectCloudinary from "./config/cloudinary.js";
import adminRouter from "./routes/adminRoute.js";

const app = express();
const port = process.env.PORT || 4000;
connectCloudinary();

// middlewares
app.use(express.json());
app.use(cors());

//API Endpoints
app.use("/api/admin", adminRouter);

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
