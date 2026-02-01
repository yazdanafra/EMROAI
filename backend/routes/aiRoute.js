// backend/routes/aiRoute.js
import express from "express";
import { analyzeImage } from "../controllers/aiController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = express.Router();

// POST /api/ai/analyze
// Body: { fileUrl: "https://...", fileId?: "...", outDir?: "tmp/..." }
// Role: requireAuth + requireRole("doctor") (matches your front-end flow)
router.post("/analyze", requireAuth, requireRole("doctor"), analyzeImage);

export default router;
