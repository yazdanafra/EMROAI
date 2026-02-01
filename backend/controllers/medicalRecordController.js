// backend/controllers/medicalRecordController.js
import mongoose from "mongoose";
import Appointment from "../models/appointmentModel.js";
import PDFDocument from "pdfkit";
import axios from "axios";

// optional GridFS delete helper (if implemented in your project)
// adjust path if different; if not available, deletion will be skipped
let deleteFileFromGridFS = null;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  // import may fail if file not present — catch it and leave null
  // path based on your code: ../config/gridfs.js
  // expected exported name: deleteFileFromGridFS
  // (if your helper has a different name, adapt the import)
  // NOTE: using require to avoid top-level import error in ESM; but we are in ESM ->
  // try dynamic import
  // eslint-disable-next-line no-undef
  // dynamic import:
  /* istanbul ignore next */
  (async () => {
    try {
      // eslint-disable-next-line global-require
      const mod = await import("../config/gridfs.js");
      deleteFileFromGridFS =
        mod.deleteFileFromGridFS || mod.removeFileFromGridFS || null;
    } catch (e) {
      // ignore, keep null
    }
  })();
} catch (e) {
  // ignore
}

/**
 * Helper: try to parse a value that might be JSON (or stringified with single quotes)
 */
function tryParseMaybeString(val) {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch (err) {
      // try forgiving single-quoted JSON-like strings
      try {
        const replaced = val.replace(/'/g, '"');
        return JSON.parse(replaced);
      } catch (err2) {
        return val;
      }
    }
  }
  return val;
}

/**
 * Normalize attachments into array of objects: { url, filename, type, uploadedBy, uploadedAt, fileId, meta? }
 */
function normalizeAttachments(raw, uploaderId) {
  let attachments = tryParseMaybeString(raw);
  if (!Array.isArray(attachments)) {
    if (attachments && typeof attachments === "object")
      attachments = [attachments];
    else if (typeof attachments === "string" && attachments.trim())
      attachments = [attachments];
    else attachments = [];
  }

  const normalized = attachments
    .map((a) => {
      if (!a) return null;

      if (typeof a === "string") {
        return {
          url: a,
          filename: undefined,
          type: undefined,
          uploadedBy: uploaderId,
          uploadedAt: new Date(),
          fileId: undefined,
        };
      }

      const url = a.url || a.path || a.file || null;
      const filename =
        a.filename || a.name || a.fileName || a.original_filename || undefined;
      const type =
        a.type ||
        a.mimeType ||
        a.resource_type ||
        a.format ||
        a.contentType ||
        undefined;
      const uploadedBy = a.uploadedBy || uploaderId || undefined;
      const uploadedAt = a.uploadedAt ? new Date(a.uploadedAt) : new Date();
      const fileId =
        a.fileId || a._id || a.id || a.public_id || a.file_id || undefined;

      const meta = {};
      for (const k of Object.keys(a)) {
        if (
          ![
            "url",
            "path",
            "file",
            "filename",
            "name",
            "fileName",
            "original_filename",
            "type",
            "mimeType",
            "resource_type",
            "format",
            "contentType",
            "uploadedBy",
            "uploadedAt",
            "fileId",
            "_id",
            "id",
            "public_id",
            "file_id",
          ].includes(k)
        ) {
          meta[k] = a[k];
        }
      }

      const res = {
        url,
        filename,
        type,
        uploadedBy,
        uploadedAt,
        fileId,
      };
      if (Object.keys(meta).length) res.meta = meta;
      return res;
    })
    .filter((x) => x && x.url);

  return normalized;
}

/**
 * Normalize prescriptions into array of objects
 */
function normalizePrescriptions(raw) {
  let prescriptions = tryParseMaybeString(raw);
  if (!Array.isArray(prescriptions)) {
    if (prescriptions && typeof prescriptions === "object")
      prescriptions = [prescriptions];
    else prescriptions = [];
  }

  return prescriptions
    .map((p) => {
      if (!p) return null;
      if (typeof p === "string") {
        return { name: p, createdAt: new Date() };
      }
      return {
        name: p.name || "",
        form: p.form || undefined,
        dose: p.dose || undefined,
        frequency: p.frequency || undefined,
        duration: p.duration || undefined,
        instructions: p.instructions || undefined,
        prescribedBy: p.prescribedBy || undefined,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
      };
    })
    .filter(Boolean);
}

// ----------------- finishAppointment -----------------
export const finishAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid appointment id" });
    }

    const raw = req.body || {};
    const {
      diagnosis: rawDiagnosis,
      prescriptions: rawPrescriptions,
      doctorNotes,
      vitals: rawVitals,
      attachments: rawAttachments,
    } = raw;

    const appointment = await Appointment.findById(id);
    if (!appointment)
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });

    // permission check: only assigned doctor or admin
    if (
      appointment.docId?.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // parse diagnosis
    let diagnosis = tryParseMaybeString(rawDiagnosis);
    if (!diagnosis || typeof diagnosis !== "object") {
      diagnosis = {
        text: diagnosis && String(diagnosis) ? String(diagnosis) : "",
        codes: [],
      };
    } else {
      diagnosis = {
        text:
          typeof diagnosis.text !== "undefined"
            ? diagnosis.text
            : diagnosis.toString
              ? diagnosis.toString()
              : "",
        codes: Array.isArray(diagnosis.codes) ? diagnosis.codes : [],
      };
    }

    // prescriptions
    const prescriptions = normalizePrescriptions(rawPrescriptions);

    // vitals
    let vitals = tryParseMaybeString(rawVitals);
    if (!vitals || typeof vitals !== "object") vitals = {};

    // attachments normalization (preserve fileId)
    const newAttachments = normalizeAttachments(rawAttachments, req.user?.id);

    // Merge attachments: keep existing attachments and append new ones.
    const existingAttachments = Array.isArray(appointment.clinical?.attachments)
      ? appointment.clinical.attachments
      : [];
    // Avoid duplicates by fileId or url (simple dedupe)
    const merged = [...existingAttachments];

    for (const na of newAttachments) {
      const dup = merged.find(
        (ea) =>
          (na.fileId && ea.fileId && String(ea.fileId) === String(na.fileId)) ||
          (ea.url && na.url && ea.url === na.url),
      );
      if (!dup) merged.push(na);
    }

    // store clinical (merged attachments)
    appointment.clinical = appointment.clinical || {};
    appointment.clinical.diagnosis = diagnosis;
    appointment.clinical.prescriptions = prescriptions;
    appointment.clinical.doctorNotes =
      typeof doctorNotes === "string"
        ? doctorNotes
        : appointment.clinical.doctorNotes || "";
    appointment.clinical.vitals = vitals;
    appointment.clinical.attachments = merged;
    appointment.clinical.finalizedAt = new Date();
    appointment.clinical.finalizedBy = req.user.id;
    appointment.isCompleted = true;

    await appointment.save();

    return res.json({ success: true, appointment });
  } catch (error) {
    console.error("finishAppointment error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ----------------- getPatientRecords -----------------
export const getPatientRecords = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user id" });
    }

    // allow patients to get only their own records unless doctor/admin
    if (req.user.role === "patient" && req.user.id !== String(userId)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const appointments = await Appointment.find({ userId })
      .sort({ date: -1 })
      .lean();
    return res.json({ success: true, records: appointments });
  } catch (error) {
    console.error("getPatientRecords error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ----------------- getAppointmentDetails -----------------
export const getAppointmentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid appointment id" });
    }

    const appointment = await Appointment.findById(id).lean();
    if (!appointment)
      return res.status(404).json({ success: false, message: "Not found" });

    const isPatient =
      req.user.role === "patient" &&
      req.user.id === appointment.userId?.toString();
    const isDoctor =
      req.user.role === "doctor" &&
      req.user.id === appointment.docId?.toString();
    const isAdmin = req.user.role === "admin";

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    return res.json({ success: true, appointment });
  } catch (error) {
    console.error("getAppointmentDetails error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ----------------- generateAppointmentPdf -----------------
export const generateAppointmentPdf = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid appointment id" });
    }
    const mode = (req.query.mode || "full").toString();

    const appointment = await Appointment.findById(id).lean();
    if (!appointment)
      return res.status(404).json({ success: false, message: "Not found" });

    const isPatient =
      req.user.role === "patient" &&
      req.user.id === appointment.userId?.toString();
    const isDoctor =
      req.user.role === "doctor" &&
      req.user.id === appointment.docId?.toString();
    const isAdmin = req.user.role === "admin";

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const filename = `appointment_${appointment._id}_${mode}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    // Header
    doc.fontSize(18).text("Appointment", { align: "center" });
    doc.moveDown(0.5);

    const patientName =
      appointment.userData?.name || appointment.userName || "Patient";
    const doctorName =
      appointment.docData?.name || appointment.docName || "Doctor";

    doc.fontSize(12).text(`Patient: ${patientName}`);
    doc.text(`Doctor: ${doctorName}`);
    if (appointment.slotDate || appointment.slotTime) {
      doc.text(
        `Date & time: ${appointment.slotDate || ""} ${appointment.slotTime || ""}`,
      );
    }
    if (appointment.clinic || appointment.location) {
      doc.text(`Location: ${appointment.clinic || appointment.location}`);
    }
    doc.moveDown(0.5);

    if (mode === "ticket") {
      doc.moveDown(0.5);
      doc.fontSize(11).text("Appointment Ticket", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).text(`Appointment ID: ${appointment._id}`);
      doc.text("Please bring valid ID and arrive 10 minutes early.");
      doc.end();
      return;
    }

    // Full mode
    doc.moveDown(0.5);
    doc.fontSize(14).text("Clinical summary", { underline: true });
    doc.moveDown(0.3);

    const clinical = appointment.clinical || {};
    doc.fontSize(11);

    // Diagnosis
    const diagnosisText = clinical.diagnosis?.text || "— none —";
    doc.fontSize(12).text("Diagnosis:");
    doc.fontSize(11).text(diagnosisText, { indent: 10 });
    doc.moveDown(0.5);

    // Prescriptions
    const prescriptions = Array.isArray(clinical.prescriptions)
      ? clinical.prescriptions
      : [];
    doc.fontSize(12).text("Prescriptions:");
    if (!prescriptions.length) {
      doc.fontSize(11).text("— none —", { indent: 10 });
    } else {
      prescriptions.forEach((p, idx) => {
        const name = p.name || "Unnamed";
        const details = [p.form, p.dose, p.frequency, p.duration]
          .filter(Boolean)
          .join(" • ");
        doc
          .fontSize(11)
          .text(`${idx + 1}. ${name}${details ? " — " + details : ""}`, {
            indent: 10,
          });
        if (p.instructions) {
          doc
            .fontSize(10)
            .text(`Instructions: ${p.instructions}`, { indent: 16 });
        }
      });
    }
    doc.moveDown(0.5);

    // Doctor notes
    doc.fontSize(12).text("Doctor notes:");
    doc.fontSize(11).text(clinical.doctorNotes || "— none —", { indent: 10 });
    doc.moveDown(0.5);

    // Vitals
    doc.fontSize(12).text("Vitals:");
    if (clinical.vitals && Object.keys(clinical.vitals).length) {
      Object.entries(clinical.vitals).forEach(([k, v]) => {
        doc.fontSize(11).text(`${k}: ${String(v)}`, { indent: 10 });
      });
    } else {
      doc.fontSize(11).text("— none —", { indent: 10 });
    }
    doc.moveDown(0.5);

    // Attachments
    const attachments = Array.isArray(clinical.attachments)
      ? clinical.attachments
      : [];
    if (attachments.length) {
      doc.addPage();
      doc.fontSize(14).text("Attachments", { underline: true });
      doc.moveDown(0.3);

      // helper to fetch and embed an image buffer
      const tryFetchAndEmbed = async (url, fitWidth = 420, fitHeight = 320) => {
        if (!url) return false;
        try {
          let fetchUrl = url;
          if (url.startsWith("/")) {
            const base =
              process.env.BACKEND_URL?.replace(/\/$/, "") ||
              `${req.protocol}://${req.get("host")}`;
            fetchUrl = `${base}${url}`;
          }
          if (fetchUrl.startsWith("data:")) return false;

          const resp = await axios.get(fetchUrl, {
            responseType: "arraybuffer",
            timeout: 20000,
          });
          const imgBuf = Buffer.from(resp.data);
          const spaceLeft = doc.page.height - doc.y - doc.page.margins.bottom;
          if (spaceLeft < 180) doc.addPage();
          doc.image(imgBuf, { fit: [fitWidth, fitHeight], align: "center" });
          doc.moveDown(0.2);
          return true;
        } catch (err) {
          console.warn("embed image failed:", err?.message || err);
          return false;
        }
      };

      for (const att of attachments) {
        doc
          .fontSize(12)
          .text(att.filename || att.url || "Attachment", { continued: false });
        doc.moveDown(0.2);

        if (att.doctorNotes) {
          doc.fontSize(11).text("Doctor notes:", { indent: 8 });
          doc.fontSize(10).text(att.doctorNotes, { indent: 12 });
          doc.moveDown(0.2);
        }

        const aiAnalysis = att.aiAnalysis || {};
        if (aiAnalysis.summary) {
          doc.fontSize(11).text("AI summary:", { indent: 8 });
          doc.fontSize(10).text(aiAnalysis.summary, { indent: 12 });
          doc.moveDown(0.2);
        }

        // embed original image if type suggests image
        if (att.type?.startsWith?.("image") && att.url) {
          // eslint-disable-next-line no-await-in-loop
          await tryFetchAndEmbed(att.url);
        }

        // overlay image (from aiAnalysis.urls.overlay or aiAnalysis.urls?.overlay)
        const overlayUrl =
          (aiAnalysis.urls && aiAnalysis.urls.overlay) ||
          (att.aiAnalysis &&
            att.aiAnalysis.urls &&
            att.aiAnalysis.urls.overlay) ||
          null;
        if (overlayUrl) {
          doc.fontSize(11).text("Overlay:", { indent: 8 });
          // eslint-disable-next-line no-await-in-loop
          await tryFetchAndEmbed(overlayUrl);
        }

        doc.moveDown(0.6);
        // divider
        if (attachments.indexOf(att) !== attachments.length - 1) {
          const left = doc.page.margins.left;
          const right = doc.page.width - doc.page.margins.right;
          doc
            .moveTo(left, doc.y)
            .lineTo(right, doc.y)
            .strokeColor("#cccccc")
            .stroke();
          doc.moveDown(0.6);
        }
      }
    }

    doc.end();
  } catch (error) {
    console.error("generateAppointmentPdf error:", error);
    if (!res.headersSent)
      return res
        .status(500)
        .json({ success: false, message: "Server error generating PDF" });
    try {
      res.end();
    } catch (e) {}
  }
};

// ----------------- deleteAppointmentAttachment -----------------
export const deleteAppointmentAttachment = async (req, res) => {
  try {
    const { id, fileId } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid appointment id" });
    }

    const { url } = req.body || {};

    const appt = await Appointment.findById(id);
    if (!appt) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });
    }

    // permission check: allow only the assigned doctor or admin
    if (appt.docId?.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const attachments = Array.isArray(appt.clinical?.attachments)
      ? appt.clinical.attachments
      : [];

    // find index by fileId/_id or by url
    let idx = -1;
    if (fileId && String(fileId) !== "undefined") {
      idx = attachments.findIndex(
        (a) =>
          (a.fileId && String(a.fileId) === String(fileId)) ||
          (a._id && String(a._id) === String(fileId)) ||
          (a.id && String(a.id) === String(fileId)),
      );
    }

    if (idx === -1 && url) {
      idx = attachments.findIndex((a) => a.url === url);
    }

    if (idx === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Attachment not found" });
    }

    const removed = attachments.splice(idx, 1)[0];

    // persist changes
    appt.clinical = appt.clinical || {};
    appt.clinical.attachments = attachments;
    await appt.save();

    // optionally delete the file bytes from GridFS if helper available and fileId present
    try {
      const realFileId = removed?.fileId;
      if (realFileId && deleteFileFromGridFS) {
        // call deletion helper (it may be async)
        await deleteFileFromGridFS(String(realFileId));
      }
    } catch (e) {
      // log but don't fail the request — appointment record deletion succeeded
      console.warn("GridFS deletion failed:", e?.message || e);
    }

    return res.json({ success: true, appointment: appt.toObject() });
  } catch (err) {
    console.error("deleteAppointmentAttachment error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export default {
  finishAppointment,
  getPatientRecords,
  getAppointmentDetails,
  generateAppointmentPdf,
  deleteAppointmentAttachment,
};
