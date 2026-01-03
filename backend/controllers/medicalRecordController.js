import Appointment from "../models/appointmentModel.js";

/**
 * Helper: try to parse a value that might be JSON (or stringified with single quotes)
 */
function tryParseMaybeString(val) {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch (err) {
      // try to be forgiving for single-quoted JSON-like strings
      try {
        const replaced = val.replace(/'/g, '"');
        return JSON.parse(replaced);
      } catch (err2) {
        // last resort: return original string
        return val;
      }
    }
  }
  return val;
}

/**
 * Normalize attachments into array of objects: { url, filename, type, uploadedBy, uploadedAt, fileId, meta? }
 * - preserves common id fields (fileId, _id, id, public_id, file_id)
 * - keeps unknown extra fields in `meta` for debugging if present
 */
function normalizeAttachments(raw, uploaderId) {
  let attachments = tryParseMaybeString(raw);
  if (!Array.isArray(attachments)) {
    // If it's a single object or single string, wrap in array
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
        // treat string as URL
        return {
          url: a,
          filename: undefined,
          type: undefined,
          uploadedBy: uploaderId,
          uploadedAt: new Date(),
          fileId: undefined,
        };
      }

      // If already object, map known fields but preserve a file id if present
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

      // preserve any identifier we know about
      const fileId =
        a.fileId || a._id || a.id || a.public_id || a.file_id || undefined;

      // keep any unexpected fields in meta (optional)
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
    .filter((x) => x && x.url); // only keep entries that have a url

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
        // best-effort: if the client sent just a name string
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

// POST /api/records/appointments/:id/finish
export const finishAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    // body fields might be JSON strings from client — parse defensively below
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
      return res.status(404).json({ message: "Appointment not found" });

    // permission check (assumes req.user is set)
    if (
      appointment.docId?.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // parse/normalize diagnosis
    let diagnosis = tryParseMaybeString(rawDiagnosis);
    if (!diagnosis || typeof diagnosis !== "object") {
      diagnosis = {
        text: diagnosis && String(diagnosis) ? String(diagnosis) : "",
        codes: [],
      };
    } else {
      diagnosis = {
        text:
          diagnosis.text || diagnosis?.text === ""
            ? diagnosis.text
            : (diagnosis || {}).toString(),
        codes: Array.isArray(diagnosis.codes) ? diagnosis.codes : [],
      };
    }

    // parse/normalize prescriptions
    const prescriptions = normalizePrescriptions(rawPrescriptions);

    // parse vitals (if stringified)
    let vitals = tryParseMaybeString(rawVitals);
    if (!vitals || typeof vitals !== "object") vitals = {};

    // parse/normalize attachments to object array (preserves fileId if provided)
    const attachments = normalizeAttachments(rawAttachments, req.user?.id);

    // assign clinical data safely
    appointment.clinical = appointment.clinical || {};
    appointment.clinical.diagnosis = diagnosis;
    appointment.clinical.prescriptions = prescriptions;
    appointment.clinical.doctorNotes =
      typeof doctorNotes === "string"
        ? doctorNotes
        : appointment.clinical.doctorNotes || "";
    appointment.clinical.vitals = vitals;
    appointment.clinical.attachments = attachments;
    appointment.clinical.finalizedAt = new Date();
    appointment.clinical.finalizedBy = req.user.id;
    appointment.isCompleted = true;

    await appointment.save();

    return res.json({ success: true, appointment });
  } catch (error) {
    console.error("finishAppointment error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /api/records/users/:userId
export const getPatientRecords = async (req, res) => {
  try {
    const { userId } = req.params;

    // allow patients to get only their own records unless doctor/admin
    if (req.user.role === "patient" && req.user.id !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const appointments = await Appointment.find({ userId })
      .sort({ date: -1 })
      .lean();
    // optionally only include fields needed
    return res.json({ success: true, records: appointments });
  } catch (error) {
    console.error("getPatientRecords error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /api/records/appointments/:id
export const getAppointmentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id).lean();
    if (!appointment) return res.status(404).json({ message: "Not found" });

    // permission checks: patient, doctor assigned, or admin
    const isPatient =
      req.user.role === "patient" &&
      req.user.id === appointment.userId?.toString();
    const isDoctor =
      req.user.role === "doctor" &&
      req.user.id === appointment.docId?.toString();
    const isAdmin = req.user.role === "admin";

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.json({ success: true, appointment });
  } catch (error) {
    console.error("getAppointmentDetails error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
