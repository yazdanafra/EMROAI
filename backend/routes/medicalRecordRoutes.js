// backend/routes/medicalRecordRoutes.js
import express from "express";
import {
  finishAppointment,
  getPatientRecords,
  getAppointmentDetails,
} from "../controllers/medicalRecordController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js"; // <- plural "middlewares"
import upload from "../middlewares/multer.js"; // <- use your existing multer file
import { uploadToCloudinary } from "../config/cloudinary.js"; // <- helper we just exported

const router = express.Router();

// finish appointment (doctor only)
router.post(
  "/appointments/:id/finish",
  requireAuth,
  requireRole("doctor"),
  finishAppointment
);

// get appointment details (patient/doctor/admin)
router.get("/appointments/:id", requireAuth, getAppointmentDetails);

// get all records for a patient
router.get("/users/:userId/records", requireAuth, getPatientRecords);

// attachment upload endpoint (doctor or authorized staff). Accepts single file field named "file"
router.post(
  "/appointments/:id/attachments",
  requireAuth,
  requireRole("doctor"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "No file uploaded" });

      // upload to cloudinary
      const result = await uploadToCloudinary(req.file.path, {
        folder: `appointments/${req.params.id}`,
        resource_type: "auto",
      });

      return res.json({
        success: true,
        file: {
          url: result.secure_url,
          filename: req.file.originalname,
          type: req.file.mimetype,
        },
      });
    } catch (error) {
      console.error("attachment upload error", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
