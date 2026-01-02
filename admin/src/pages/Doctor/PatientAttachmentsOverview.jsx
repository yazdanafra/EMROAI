// admin/src/pages/Doctor/PatientAttachmentsOverview.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";
import { assets } from "../../assets/assets";

const PatientAttachmentsOverview = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { dToken, backendUrl } = useContext(DoctorContext);
  const { slotDateFormat } = useContext(AppContext);

  const [loading, setLoading] = useState(true);
  const [appointmentsWithAttachments, setAppointmentsWithAttachments] =
    useState([]);

  // search state for folder titles
  const [searchTerm, setSearchTerm] = useState("");

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
          const appts = data.appointments || [];
          const filtered = appts.filter(
            (a) => (a?.clinical?.attachments || []).length > 0
          );
          setAppointmentsWithAttachments(filtered);
        } else {
          setAppointmentsWithAttachments([]);
        }
      } catch (err) {
        console.error("fetch patient appointments error:", err);
        setAppointmentsWithAttachments([]);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [userId, dToken, backendUrl]);

  const filtered = useMemo(() => {
    const q = (searchTerm || "").trim().toLowerCase();
    if (!q) return appointmentsWithAttachments;
    return appointmentsWithAttachments.filter((a) => {
      const title = a.slotDate
        ? slotDateFormat(a.slotDate)
        : a.date
        ? new Date(a.date).toLocaleDateString()
        : "appointment";
      return String(title).toLowerCase().includes(q);
    });
  }, [appointmentsWithAttachments, searchTerm, slotDateFormat]);

  return (
    <div className="m-5 max-w-6xl">
      {/* title above controls on small screens, controls right on larger screens */}
      <div className="mb-6 flex flex-col sm:flex-row items-start justify-between">
        <div className="flex-1 pr-6">
          <h2 className="text-2xl font-semibold text-gray-700">
            All Attachments for patient
          </h2>
          <p className="text-sm text-gray-500">
            {appointmentsWithAttachments.length} appointment
            {appointmentsWithAttachments.length !== 1 ? "s" : ""} with files
          </p>
        </div>

        <div className="flex items-center gap-2 sm:mt-0 mt-4">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search folders by date..."
            className="px-3 py-2 border rounded text-sm w-full sm:w-64"
          />
          <button
            onClick={() => setSearchTerm("")}
            className="px-3 py-2 border rounded text-sm"
          >
            Clear
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-2 border rounded text-sm"
          >
            Back
          </button>
        </div>
      </div>

      {/* folders container uses full width */}
      <div className="bg-white border rounded p-4 w-full">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No attachments found for this patient.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {filtered.map((a) => {
              const fileCount = (a.clinical?.attachments || []).length;
              const title = a.slotDate
                ? slotDateFormat(a.slotDate)
                : a.date
                ? new Date(a.date).toLocaleDateString()
                : "Appointment";
              return (
                <div
                  key={a._id}
                  className="flex flex-col items-center gap-2 border rounded p-4 hover:shadow cursor-pointer"
                  onClick={() =>
                    navigate(`/doctor-patient/${userId}/attachments/${a._id}`)
                  }
                >
                  <img
                    src={assets.folder_icon150}
                    alt="folder"
                    className="w-20 h-20 object-contain"
                  />
                  <div className="text-sm font-medium text-gray-800">
                    {title}
                  </div>
                  <div className="text-xs text-gray-500">
                    {fileCount} file{fileCount !== 1 ? "s" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientAttachmentsOverview;
