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
  doctorPatientAppointments,
} from "../controllers/doctorController.js";
import authDoctor from "../middlewares/authDoctor.js";
import upload from "../middlewares/multer.js"; // <-- NEW import

const doctorRouter = express.Router();

doctorRouter.get("/list", doctorList);
doctorRouter.post("/login", loginDoctor);

// protected endpoints:
doctorRouter.get("/appointments", authDoctor, appointmentsDoctor);
doctorRouter.post("/complete-appointment", authDoctor, appointmentComplete);
doctorRouter.post("/cancel-appointment", authDoctor, appointmentCancel);
doctorRouter.get("/dashboard", authDoctor, doctorDashboard);
doctorRouter.get("/profile", authDoctor, doctorProfile);

// receive multipart image under field name "image"
doctorRouter.post(
  "/update-profile",
  authDoctor,
  upload.single("image"),
  updateDoctorProfile
);

doctorRouter.get("/patients", authDoctor, doctorPatients);

doctorRouter.get(
  "/patients/:userId/appointments",
  authDoctor,
  doctorPatientAppointments
);

export default doctorRouter;
