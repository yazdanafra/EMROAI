// backend/routes/medicalRecordRoutes.js
import express from "express";
import mongoose from "mongoose";
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
        doctorNotes: "", // new fields default
        aiAnalysis: {},
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

/**
 * PATCH doctor notes for a single attachment
 * Endpoint: PATCH /appointments/:id/attachments/:fileId/doctor-notes
 * Body: { doctorNotes: "..." }
 * Role: doctor
 */
router.patch(
  "/appointments/:id/attachments/:fileId/doctor-notes",
  requireAuth,
  requireRole("doctor"),
  async (req, res) => {
    try {
      const { id, fileId } = req.params;
      const { doctorNotes } = req.body;
      if (typeof doctorNotes !== "string") {
        return res
          .status(400)
          .json({ success: false, message: "doctorNotes required" });
      }

      const appt = await Appointment.findById(id);
      if (!appt)
        return res
          .status(404)
          .json({ success: false, message: "Appointment not found" });

      const attachments = appt.clinical?.attachments || [];
      const idx = attachments.findIndex(
        (a) =>
          String(a.fileId) === String(fileId) ||
          String(a._id) === String(fileId)
      );
      if (idx === -1) {
        return res
          .status(404)
          .json({ success: false, message: "Attachment not found" });
      }

      const key = `clinical.attachments.${idx}.doctorNotes`;
      const updated = await Appointment.findByIdAndUpdate(
        id,
        { $set: { [key]: doctorNotes } },
        { new: true }
      ).lean();

      return res.json({ success: true, appointment: updated });
    } catch (err) {
      console.error("update doctor notes error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/**
 * PATCH save AI analysis result for a single attachment
 * Endpoint: PATCH /appointments/:id/attachments/:fileId/ai
 * Body: { aiAnalysis: {...} }
 * Role: doctor (or admin)
 */
router.patch(
  "/appointments/:id/attachments/:fileId/ai",
  requireAuth,
  requireRole("doctor"),
  async (req, res) => {
    try {
      const { id, fileId } = req.params;
      const { aiAnalysis } = req.body;
      if (!aiAnalysis) {
        return res
          .status(400)
          .json({ success: false, message: "aiAnalysis required" });
      }

      const appt = await Appointment.findById(id);
      if (!appt)
        return res
          .status(404)
          .json({ success: false, message: "Appointment not found" });

      const attachments = appt.clinical?.attachments || [];
      const idx = attachments.findIndex(
        (a) =>
          String(a.fileId) === String(fileId) ||
          String(a._id) === String(fileId)
      );
      if (idx === -1) {
        return res
          .status(404)
          .json({ success: false, message: "Attachment not found" });
      }

      const key = `clinical.attachments.${idx}.aiAnalysis`;
      const updated = await Appointment.findByIdAndUpdate(
        id,
        { $set: { [key]: aiAnalysis } },
        { new: true }
      ).lean();

      return res.json({ success: true, appointment: updated });
    } catch (err) {
      console.error("save aiAnalysis error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

export default router;
