// admin/src/pages/Doctor/AppointmentAttachments.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";

const AppointmentAttachments = () => {
  const { userId, appointmentId } = useParams();
  const navigate = useNavigate();
  const { dToken, backendUrl } = useContext(DoctorContext);
  const { slotDateFormat } = useContext(AppContext);

  const [loading, setLoading] = useState(true);
  const [appointment, setAppointment] = useState(null);
  const [attachments, setAttachments] = useState([]);

  // search attachments by filename/url
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!appointmentId) return;
    const fetch = async () => {
      setLoading(true);
      try {
        // use records endpoint which requires Authorization Bearer header
        const { data } = await axios.get(
          `${backendUrl}/api/records/appointments/${appointmentId}`,
          {
            headers: { Authorization: `Bearer ${dToken}` },
          }
        );
        if (data.success) {
          const ap = data.appointment || data;
          setAppointment(ap);
          setAttachments(ap?.clinical?.attachments || []);
        } else {
          setAppointment(null);
          setAttachments([]);
        }
      } catch (err) {
        console.error("fetch appointment details:", err);
        setAppointment(null);
        setAttachments([]);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [appointmentId, dToken, backendUrl]);

  // filtered attachments
  const filteredAttachments = useMemo(() => {
    const q = (searchTerm || "").trim().toLowerCase();
    if (!q) return attachments;
    return attachments.filter((att) => {
      const name = String(att.filename || att.url || "").toLowerCase();
      return name.includes(q);
    });
  }, [attachments, searchTerm]);

  const title = appointment
    ? appointment.slotDate
      ? slotDateFormat(appointment.slotDate)
      : appointment.date
      ? new Date(appointment.date).toLocaleString()
      : "Appointment"
    : "Appointment";

  return (
    <div className="m-5 max-w-6xl">
      <div className="mb-4 flex flex-col sm:flex-row items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-700">
            {title} — Attachments
          </h2>
          <p className="text-sm text-gray-500">
            {attachments.length} file{attachments.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex gap-2 items-center sm:mt-0 mt-3 w-full sm:w-auto">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search files by name..."
            className="px-3 py-2 border rounded text-sm w-full sm:w-auto"
          />
          <button
            onClick={() => setSearchTerm("")}
            className="px-3 py-2 border rounded text-sm"
          >
            Clear
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1 border rounded text-sm"
          >
            Back
          </button>
          <button
            onClick={() => navigate(`/doctor-patient/${userId}/attachments`)}
            className="px-3 py-1 border rounded text-sm"
          >
            All folders
          </button>
        </div>
      </div>

      <div className="bg-white border rounded p-4">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : filteredAttachments.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No attachments for this appointment.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredAttachments.map((att, i) => {
              const isImage =
                att.type && att.type.startsWith && att.type.startsWith("image");
              return (
                <div
                  key={i}
                  className="border rounded overflow-hidden bg-gray-50"
                >
                  <div className="h-48 flex items-center justify-center bg-white">
                    {isImage ? (
                      <img
                        src={att.url}
                        alt={att.filename}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="p-4 text-sm text-gray-600">
                        {att.filename || att.url}
                      </div>
                    )}
                  </div>

                  <div className="p-3 flex items-center justify-between">
                    <div className="text-sm text-gray-700 break-words max-w-[60%]">
                      {att.filename || att.url}
                    </div>

                    <div className="flex gap-2">
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 border rounded text-xs hover:bg-gray-100"
                      >
                        Open
                      </a>
                      <a
                        href={att.url}
                        download
                        className="px-2 py-1 border rounded text-xs hover:bg-gray-100"
                      >
                        Download
                      </a>
                      <button
                        onClick={() => {
                          /* analyze placeholder */
                        }}
                        className="px-2 py-1 border rounded text-xs hover:bg-gray-100"
                      >
                        Analyze Image
                      </button>
                    </div>
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

export default AppointmentAttachments;
