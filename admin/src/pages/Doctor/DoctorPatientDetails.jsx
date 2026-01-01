// admin/src/pages/Doctor/DoctorPatientDetails.jsx
import React, { useContext, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";
import { assets } from "../../assets/assets";

const DoctorPatientDetails = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { dToken, backendUrl } = useContext(DoctorContext);
  const { slotDateFormat, currency } = useContext(AppContext);

  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [patientName, setPatientName] = useState("");

  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(
          `${backendUrl}/api/doctor/patients/${userId}/appointments`,
          { headers: { dToken } }
        );
        if (data.success) {
          setAppointments(data.appointments || []);
          if (data.appointments && data.appointments.length > 0) {
            setPatientName(data.appointments[0].userData?.name || "");
          }
        } else {
          setAppointments([]);
        }
      } catch (err) {
        console.error("fetch patient appointments error:", err);
        setAppointments([]);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [userId, dToken, backendUrl]);

  return (
    <div className="m-5 max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-700">
            Patient: {patientName || userId}
          </h2>
          <p className="text-sm text-gray-500">
            Appointments with you ({appointments.length})
          </p>
        </div>
        <div>
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1 border rounded text-sm"
          >
            Back
          </button>
        </div>
      </div>

      <div className="bg-white border rounded">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 p-4 border-b text-sm text-gray-600">
          <div>Slot Date</div>
          <div>Slot Time</div>
          <div>Status</div>
          <div>Action</div>
        </div>

        <div>
          {loading ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : appointments.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No appointments found for this patient.
            </div>
          ) : (
            appointments.map((a, idx) => {
              const status = a.cancelled
                ? "Cancelled"
                : a.isCompleted
                ? "Completed"
                : "Pending";
              return (
                <div
                  key={a._id || idx}
                  className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 items-center p-4 border-b hover:bg-gray-50"
                >
                  <div className="text-sm text-gray-800">
                    {a.slotDate
                      ? slotDateFormat(a.slotDate)
                      : a.date
                      ? new Date(a.date).toLocaleDateString()
                      : "—"}
                  </div>
                  <div className="text-sm">{a.slotTime || "—"}</div>
                  <div className="text-sm">
                    {status === "Cancelled" ? (
                      <span className="text-red-500 text-xs font-medium">
                        Cancelled
                      </span>
                    ) : status === "Completed" ? (
                      <span className="text-green-600 text-xs font-medium">
                        Completed
                      </span>
                    ) : (
                      <span className="text-yellow-600 text-xs font-medium">
                        Pending
                      </span>
                    )}
                  </div>

                  <div>
                    {/* Details: placeholder for next step */}
                    <button
                      onClick={() => {
                        // placeholder — later: navigate to appointment detail or open modal
                        // e.g. navigate(`/doctor-appointment/${a._id}`)
                        alert("Details click — implement details view next.");
                      }}
                      className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorPatientDetails;
