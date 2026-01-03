// backend/models/appointmentModel.js  (only show the AttachmentSchema change)
import mongoose from "mongoose";

const { Schema } = mongoose;

const AttachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    filename: { type: String },
    type: { type: String }, // mime type
    uploadedBy: { type: String }, // store uploader id or name
    uploadedAt: { type: Date, default: Date.now },
    fileId: { type: mongoose.Schema.Types.ObjectId }, // GridFS file id (optional)

    // NEW fields:
    doctorNotes: { type: String, default: "" }, // editable by doctor
    // aiAnalysis can hold structured AI output (object), e.g. { summary: "...", findings: [...], score: ... }
    aiAnalysis: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const PrescriptionSchema = new Schema(
  {
    name: { type: String },
    form: { type: String }, // tablet, drops...
    dose: { type: String }, // "5 mg"
    frequency: { type: String }, // "twice daily"
    duration: { type: String }, // "7 days"
    instructions: { type: String },
    prescribedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DiagnosisCodeSchema = new Schema(
  { system: String, code: String, display: String },
  { _id: false }
);

const ClinicalSchema = new Schema(
  {
    diagnosis: {
      text: String,
      codes: { type: [DiagnosisCodeSchema], default: [] }, // e.g. ICD-10
    },
    prescriptions: { type: [PrescriptionSchema], default: [] },
    doctorNotes: { type: String, default: "" },
    vitals: { bp: String, hr: Number, etc: Object },
    attachments: { type: [AttachmentSchema], default: [] },
    finalizedAt: Date,
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor" },
  },
  { _id: false }
);

const appointmentSchema = new Schema({
  userId: String,
  docId: String,
  userData: Object,
  docData: Object,
  amount: Number,
  slotTime: String,
  slotDate: String,
  date: Date,
  isCompleted: { type: Boolean, default: false },
  cancelled: { type: Boolean, default: false }, // <-- added field

  // NEW fields for medical record
  clinical: { type: ClinicalSchema, default: {} },
});

// Keep model name consistent (use lowercase collection name if you prefer)
const appointmentModel =
  mongoose.models.appointment ||
  mongoose.model("appointment", appointmentSchema);

export default appointmentModel;
