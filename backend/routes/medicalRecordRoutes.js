// backend/routes/medicalRecordRoutes.js
import express from "express";
import {
  finishAppointment,
  getPatientRecords,
  getAppointmentDetails,
} from "../controllers/medicalRecordController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js";
import { saveFileToGridFS } from "../config/gridfs.js";
import Appointment from "../models/appointmentModel.js"; // persist attachment into appointment

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
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });

      // Save file to GridFS
      const saved = await saveFileToGridFS(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        { appointmentId: req.params.id, uploadedBy: req.user?.id }
      );

      // Build absolute URL for client (streaming route)
      // saved.streamUrl is like '/api/files/<id>'
      const base =
        process.env.BACKEND_URL && process.env.BACKEND_URL.trim().length
          ? process.env.BACKEND_URL.replace(/\/$/, "")
          : `${req.protocol}://${req.get("host")}`; // fallback to request host
      const publicUrl = `${base}${saved.streamUrl}`;

      // Build attachment object to persist into appointment.clinical.attachments
      const attachment = {
        url: publicUrl,
        filename: req.file.originalname,
        type: req.file.mimetype,
        uploadedBy: req.user?.id,
        uploadedAt: new Date(),
        fileId: saved.fileId || undefined,
      };

      // Try to push the attachment into appointment.clinical.attachments.
      // If appointment doesn't exist or update fails, we still return success for upload.
      let updatedAppointment = null;
      try {
        updatedAppointment = await Appointment.findByIdAndUpdate(
          req.params.id,
          { $push: { "clinical.attachments": attachment } },
          { new: true, runValidators: true }
        ).lean();
      } catch (uErr) {
        console.warn(
          "Failed to persist attachment to appointment:",
          uErr?.message || uErr
        );
        // continue — we still return uploaded file info
      }

      return res.json({
        success: true,
        file: {
          url: publicUrl,
          fileId: saved.fileId,
          filename: req.file.originalname,
          type: req.file.mimetype,
          uploadedAt: attachment.uploadedAt,
          uploadedBy: attachment.uploadedBy,
        },
        appointment: updatedAppointment || undefined, // useful for client to refresh state
      });
    } catch (error) {
      console.error("attachment upload error", error);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

export default router;
