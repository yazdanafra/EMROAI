// backend/routes/doctorRoute.js
import express from "express";
import {
  doctorList,
  loginDoctor,
  appointmentsDoctor,
  appointmentComplete,
  appointmentCancel,
  doctorDashboard,
  doctorProfile,
  updateDoctorProfile,
  doctorPatients,
  doctorPatientAppointments, // <-- new
} from "../controllers/doctorController.js"; // note path (adjust if your import path differs)
import authDoctor from "../middlewares/authDoctor.js";

const doctorRouter = express.Router();

doctorRouter.get("/list", doctorList);
doctorRouter.post("/login", loginDoctor);

// protected endpoints:
doctorRouter.get("/appointments", authDoctor, appointmentsDoctor);
doctorRouter.post("/complete-appointment", authDoctor, appointmentComplete);
doctorRouter.post("/cancel-appointment", authDoctor, appointmentCancel);
doctorRouter.get("/dashboard", authDoctor, doctorDashboard);
doctorRouter.get("/profile", authDoctor, doctorProfile);
doctorRouter.post("/update-profile", authDoctor, updateDoctorProfile);

// NEW: patients list (doctor-only)
doctorRouter.get("/patients", authDoctor, doctorPatients);

// NEW: appointments for a particular patient (doctor-only)
doctorRouter.get(
  "/patients/:userId/appointments",
  authDoctor,
  doctorPatientAppointments
);

export default doctorRouter;
