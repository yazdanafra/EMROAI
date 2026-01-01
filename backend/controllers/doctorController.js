// backend/controllers/doctorController.js
import doctorModel from "../models/doctorModel.js";
import bycrypt from "bcrypt";
import jwt from "jsonwebtoken";
import appointmentModel from "../models/appointmentModel.js";

/**
 * Toggle doctor's availability
 */
const changeAvailability = async (req, res) => {
  try {
    const { docId } = req.body;
    const docData = await doctorModel.findById(docId);
    await doctorModel.findByIdAndUpdate(docId, {
      available: !docData.available,
    });
    res.json({ success: true, message: "Availability changed" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/**
 * List doctors (public)
 */
const doctorList = async (req, res) => {
  try {
    const doctors = await doctorModel.find({}).select(["-password", "-email"]);
    res.json({ success: true, doctors });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/**
 * Doctor login
 */
const loginDoctor = async (req, res) => {
  try {
    const { email, password } = req.body;
    const doctor = await doctorModel.findOne({ email });

    if (!doctor) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bycrypt.compare(password, doctor.password);

    if (isMatch) {
      // include role so requireAuth/requireRole can work
      const token = jwt.sign(
        { id: doctor._id, role: "doctor" },
        process.env.JWT_SECRET
      );
      res.json({ success: true, token });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/**
 * Get appointments for a doctor panel
 * Accepts docId either from req.body.docId or req.user.id (fallback)
 */
const appointmentsDoctor = async (req, res) => {
  try {
    const docId = req.body.docId || (req.user && req.user.id);
    if (!docId) return res.json({ success: false, message: "Missing docId" });

    const appointments = await appointmentModel
      .find({ docId })
      .sort({ date: -1 })
      .lean();

    res.json({ success: true, appointments });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/**
 * Returns list of patients this doctor has visited (doctor has >=1 completed appointment with patient)
 * Response: { success: true, patients: [{ userId, userData: {name,image,...}, lastVisited }] }
 */
const doctorPatients = async (req, res) => {
  try {
    const docId = req.body.docId || (req.user && req.user.id);
    if (!docId) return res.json({ success: false, message: "Missing docId" });

    // Find all completed appointments for this doctor, newest first
    const appts = await appointmentModel
      .find({ docId: String(docId), isCompleted: true })
      .sort({ date: -1 })
      .lean();

    // Build unique list by userId, preserving the most recent appointment info
    const map = new Map();
    for (const a of appts) {
      const uid = a.userId?.toString() || null;
      if (!uid) continue;
      if (!map.has(uid)) {
        map.set(uid, {
          userId: uid,
          userData: a.userData || {},
          lastVisited: a.date || a.slotDate || null,
        });
      }
    }

    const patients = Array.from(map.values());

    res.json({ success: true, patients });
  } catch (error) {
    console.error("doctorPatients error:", error);
    res.json({ success: false, message: error.message });
  }
};

/**
 * Mark appointment completed
 */
const appointmentComplete = async (req, res) => {
  try {
    const docId = req.body.docId || (req.user && req.user.id);
    const { appointmentId } = req.body;
    if (!docId) return res.json({ success: false, message: "Missing docId" });
    if (!appointmentId)
      return res.json({ success: false, message: "Missing appointmentId" });

    const appointmentData = await appointmentModel.findById(appointmentId);

    if (
      appointmentData &&
      appointmentData.docId?.toString() === String(docId)
    ) {
      await appointmentModel.findByIdAndUpdate(appointmentId, {
        isCompleted: true,
      });
      return res.json({ success: true, message: "Appointment Completed" });
    } else {
      return res.json({
        success: false,
        message: "Mark Failed - permission or not found",
      });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/**
 * Cancel appointment (doctor)
 */
const appointmentCancel = async (req, res) => {
  try {
    const docId = req.body.docId || (req.user && req.user.id);
    const { appointmentId } = req.body;
    if (!docId) return res.json({ success: false, message: "Missing docId" });
    if (!appointmentId)
      return res.json({ success: false, message: "Missing appointmentId" });

    const appointmentData = await appointmentModel.findById(appointmentId);

    if (
      appointmentData &&
      appointmentData.docId?.toString() === String(docId)
    ) {
      // Set cancelled flag
      await appointmentModel.findByIdAndUpdate(appointmentId, {
        cancelled: true,
      });

      // Release booked slot in doctor's record if present
      try {
        const dId = appointmentData.docId;
        const slotDate = appointmentData.slotDate;
        const slotTime = appointmentData.slotTime;
        if (dId && slotDate && slotTime) {
          const doctorData = await doctorModel.findById(dId);
          if (doctorData) {
            const slots_booked = doctorData.slots_booked || {};
            if (Array.isArray(slots_booked[slotDate])) {
              const newList = slots_booked[slotDate].filter(
                (t) => t !== slotTime
              );
              slots_booked[slotDate] = newList;
              await doctorModel.findByIdAndUpdate(dId, { slots_booked });
            }
          }
        }
      } catch (releaseErr) {
        console.warn(
          "Failed to release slot on cancellation:",
          releaseErr?.message || releaseErr
        );
        // not fatal for cancellation itself
      }

      return res.json({ success: true, message: "Appointment Cancelled" });
    } else {
      return res.json({
        success: false,
        message: "Cancellation Failed - permission or not found",
      });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/**
 * Doctor dashboard
 */
const doctorDashboard = async (req, res) => {
  try {
    const docId = req.body.docId || (req.user && req.user.id);
    if (!docId) return res.json({ success: false, message: "Missing docId" });

    const appointments = await appointmentModel.find({ docId });

    let earnings = 0;
    appointments.forEach((item) => {
      if (item.isCompleted || item.payment) {
        earnings += item.amount || 0;
      }
    });

    const patients = [];
    appointments.forEach((item) => {
      if (!patients.includes(item.userId)) {
        patients.push(item.userId);
      }
    });

    const dashData = {
      earnings,
      appointments: appointments.length,
      patients: patients.length,
      latestAppointments: appointments.slice().reverse().slice(0, 5),
    };

    res.json({ success: true, dashData });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/**
 * Get doctor profile
 */
const doctorProfile = async (req, res) => {
  try {
    const docId = req.body.docId || (req.user && req.user.id);
    if (!docId) return res.json({ success: false, message: "Missing docId" });

    const profileData = await doctorModel.findById(docId).select("-password");

    res.json({ success: true, profileData });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/**
 * Update doctor profile
 */
const updateDoctorProfile = async (req, res) => {
  try {
    const { docId, fees, address, available } = req.body;

    await doctorModel.findByIdAndUpdate(docId, { fees, address, available });

    res.json({ success: true, message: "Profile Updated" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

export {
  changeAvailability,
  doctorList,
  loginDoctor,
  appointmentsDoctor,
  appointmentCancel,
  appointmentComplete,
  doctorDashboard,
  doctorProfile,
  updateDoctorProfile,
  doctorPatients, // <--- new export
};
