// admin/src/context/DoctorContext.jsx
import { createContext, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "react-toastify";

export const DoctorContext = createContext();

const DoctorContextProvider = (props) => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const [dToken, setDToken] = useState(
    localStorage.getItem("dToken") ? localStorage.getItem("dToken") : ""
  );
  const [appointments, setAppointments] = useState([]);
  const [dashData, setDashData] = useState(false);
  // initialize as an object so components that read nested fields won't crash
  const [profileData, setProfileData] = useState({});

  // NEW: patients state
  const [patients, setPatients] = useState([]);

  const getAppointments = async () => {
    try {
      const { data } = await axios.get(
        backendUrl + "/api/doctor/appointments",
        {
          headers: { dToken },
        }
      );
      if (data.success) {
        setAppointments(data.appointments);
        console.log("appointments:", data.appointments);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.log(error);
      toast.error(error.message);
    }
  };

  const completeAppointment = async (appointmentId) => {
    try {
      const { data } = await axios.post(
        backendUrl + "/api/doctor/complete-appointment",
        { appointmentId },
        { headers: { dToken } }
      );

      if (data.success) {
        toast.success(data.message);
        getAppointments();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.log(error);
      toast.error(error.message);
    }
  };

  const cancelAppointment = async (appointmentId) => {
    try {
      const { data } = await axios.post(
        backendUrl + "/api/doctor/cancel-appointment",
        { appointmentId },
        { headers: { dToken } }
      );

      if (data.success) {
        toast.success(data.message);
        getAppointments();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.log(error);
      toast.error(error.message);
    }
  };

  const getDashData = async () => {
    try {
      const { data } = await axios.get(backendUrl + "/api/doctor/dashboard", {
        headers: { dToken },
      });
      if (data.success) {
        setDashData(data.dashData);
        console.log("dashData:", data.dashData);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.log(error);
      toast.error(error.message);
    }
  };

  // make getProfileData stable so components depending on it don't retrigger on every render
  const getProfileData = useCallback(async () => {
    try {
      const { data } = await axios.get(backendUrl + "/api/doctor/profile", {
        headers: { dToken },
      });
      if (data.success && data.profileData) {
        setProfileData(data.profileData);
        console.log("profileData:", data.profileData);
      } else {
        // keep profileData as {} if no data
        console.warn("getProfileData: no profileData returned");
      }
    } catch (error) {
      console.log(error);
      toast.error(error.message);
    }
    // only re-create if backendUrl or dToken changes
  }, [backendUrl, dToken]);

  // NEW: get patients list
  const getPatients = useCallback(async () => {
    try {
      const { data } = await axios.get(backendUrl + "/api/doctor/patients", {
        headers: { dToken },
      });
      if (data.success) {
        setPatients(data.patients || []);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error("getPatients error:", error);
      toast.error(error?.message || "Failed to fetch patients");
    }
  }, [backendUrl, dToken]);

  const value = {
    dToken,
    setDToken,
    backendUrl,
    appointments,
    setAppointments,
    getAppointments,
    completeAppointment,
    cancelAppointment,
    dashData,
    setDashData,
    getDashData,
    profileData,
    setProfileData,
    getProfileData,
    patients,
    getPatients,
  };

  return (
    <DoctorContext.Provider value={value}>
      {props.children}
    </DoctorContext.Provider>
  );
};

export default DoctorContextProvider;
