// backend/routes/medicalRecordRoutes.js
import express from "express";
import {
  finishAppointment,
  getPatientRecords,
  getAppointmentDetails,
  generateAppointmentPdf,
  deleteAppointmentAttachment,
} from "../controllers/medicalRecordController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js";
import { saveFileToGridFS } from "../config/gridfs.js";
import Appointment from "../models/appointmentModel.js";

const router = express.Router();

// finish appointment (doctor only)
router.post(
  "/appointments/:id/finish",
  requireAuth,
  requireRole("doctor"),
  finishAppointment,
);

// get appointment details (patient/doctor/admin)
router.get("/appointments/:id", requireAuth, getAppointmentDetails);

// download appointment PDF (ticket or full)
router.get("/appointments/:id/pdf", requireAuth, generateAppointmentPdf);

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
        { appointmentId: req.params.id, uploadedBy: req.user?.id },
      );

      const base =
        process.env.BACKEND_URL && process.env.BACKEND_URL.trim().length
          ? process.env.BACKEND_URL.replace(/\/$/, "")
          : `${req.protocol}://${req.get("host")}`;
      const publicUrl = `${base}${saved.streamUrl}`;

      const attachment = {
        url: publicUrl,
        filename: req.file.originalname,
        type: req.file.mimetype,
        uploadedBy: req.user?.id,
        uploadedAt: new Date(),
        fileId: saved.fileId || undefined,
        doctorNotes: "",
        aiAnalysis: {},
      };

      let updatedAppointment = null;
      try {
        updatedAppointment = await Appointment.findByIdAndUpdate(
          req.params.id,
          { $push: { "clinical.attachments": attachment } },
          { new: true, runValidators: true },
        ).lean();
      } catch (uErr) {
        console.warn(
          "Failed to persist attachment to appointment:",
          uErr?.message || uErr,
        );
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
        appointment: updatedAppointment || undefined,
      });
    } catch (error) {
      console.error("attachment upload error", error);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

// patch doctor notes for attachment
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
          String(a._id) === String(fileId),
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
        { new: true },
      ).lean();

      return res.json({ success: true, appointment: updated });
    } catch (err) {
      console.error("update doctor notes error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

// patch save aiAnalysis result for attachment
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
          String(a._id) === String(fileId),
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
        { new: true },
      ).lean();

      return res.json({ success: true, appointment: updated });
    } catch (err) {
      console.error("save aiAnalysis error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

// DELETE attachment (by fileId in URL or by { url } in body)
// e.g. DELETE /appointments/:id/attachments/:fileId
// if :fileId omitted, pass { url } in body and it will delete by url match
// DELETE by fileId
router.delete(
  "/appointments/:id/attachments/:fileId",
  requireAuth,
  requireRole("doctor"),
  async (req, res) => {
    try {
      // delegate to controller (controller expects req.params.fileId or req.body.url)
      return deleteAppointmentAttachment(req, res);
    } catch (err) {
      console.error("attachment delete (by fileId) route error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

// DELETE by url (no fileId in URL) - expects { url: "<public url>" } in body
router.delete(
  "/appointments/:id/attachments",
  requireAuth,
  requireRole("doctor"),
  async (req, res) => {
    try {
      // controller will use req.body.url to find & remove attachment
      return deleteAppointmentAttachment(req, res);
    } catch (err) {
      console.error("attachment delete (by url) route error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

export default router;
