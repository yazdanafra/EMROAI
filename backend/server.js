// server.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import connectDB from "./config/mongodb.js";

const app = express();
const port = process.env.PORT || 4000;

// middlewares
app.use(express.json());
app.use(cors());

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
