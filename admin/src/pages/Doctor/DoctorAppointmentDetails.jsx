// admin/src/pages/Doctor/DoctorAppointmentDetails.jsx
import React, { useContext, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";
import DoctorCompleteModal from "../../components/DoctorCompleteModal"; // optional reuse if needed
import { assets } from "../../assets/assets";

const DoctorAppointmentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dToken, backendUrl } = useContext(DoctorContext);
  const { slotDateFormat, currency } = useContext(AppContext);

  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // IMPORTANT: send Authorization Bearer token so requireAuth works
        const { data } = await axios.get(
          `${backendUrl}/api/records/appointments/${id}`,
          {
            headers: {
              Authorization: `Bearer ${dToken}`,
            },
          }
        );
        if (data.success) {
          setAppointment(data.appointment);
        } else {
          setErr(data.message || "Failed to load");
          toast.error(data.message || "Failed to load appointment");
        }
      } catch (error) {
        console.error("fetch appointment details error", error);
        const msg =
          error?.response?.data?.message ||
          error?.message ||
          "Failed to fetch appointment";
        setErr(msg);
        toast.error(msg);
        // if 401, redirect to login (optional)
        if (error?.response?.status === 401) {
          // token invalid/expired: log out or navigate to login — here we navigate back
          navigate(-1);
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dToken]);

  if (loading) {
    return (
      <div className="m-5">
        <p>Loading appointment details...</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="m-5">
        <p className="text-red-600">Error: {err}</p>
        <button
          className="mt-2 px-3 py-1 border rounded"
          onClick={() => navigate(-1)}
        >
          Back
        </button>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="m-5">
        <p>No appointment selected.</p>
      </div>
    );
  }

  const clinical = appointment.clinical || {};
  const diagnosis = clinical.diagnosis || {};
  const prescriptions = clinical.prescriptions || [];
  const vitals = clinical.vitals || {};
  const attachments = clinical.attachments || [];

  return (
    <div className="m-5 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">
            Appointment details — {appointment.userData?.name}
          </h2>
          <p className="text-sm text-gray-500">
            {slotDateFormat(appointment.slotDate)}, {appointment.slotTime} •{" "}
            {currency}
            {appointment.amount}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1 border rounded hover:bg-gray-100"
          >
            Back
          </button>
        </div>
      </div>

      {/* Top half: clinical info */}
      <div className="bg-white border rounded p-5 mb-4">
        <h3 className="font-medium mb-2">Clinical summary</h3>

        <div className="mb-3">
          <p className="text-sm text-gray-600">Diagnosis</p>
          <p className="mt-1 text-gray-800">
            {diagnosis?.text || "— no diagnosis provided —"}
          </p>
          {Array.isArray(diagnosis.codes) && diagnosis.codes.length > 0 && (
            <div className="mt-2 text-xs text-gray-600">
              Codes:
              <ul className="list-disc list-inside">
                {diagnosis.codes.map((c, i) => (
                  <li key={i}>
                    {c.system || ""} {c.code ? `: ${c.code}` : ""}{" "}
                    {c.display ? `(${c.display})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mb-3">
          <p className="text-sm text-gray-600">Prescriptions</p>
          {prescriptions.length === 0 ? (
            <p className="mt-1 text-gray-800">— none —</p>
          ) : (
            <div className="mt-1">
              {prescriptions.map((p, i) => (
                <div
                  key={i}
                  className="p-2 border rounded mb-2 bg-gray-50 text-sm"
                >
                  <div className="font-medium">{p.name || "Unnamed"}</div>
                  <div className="text-xs text-gray-600">
                    {p.form ? `${p.form} • ` : ""}
                    {p.dose ? `${p.dose} • ` : ""}
                    {p.frequency ? `${p.frequency} • ` : ""}
                    {p.duration ? `${p.duration}` : ""}
                  </div>
                  {p.instructions && (
                    <div className="mt-1 text-xs text-gray-700">
                      Instructions: {p.instructions}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-3">
          <p className="text-sm text-gray-600">Doctor notes</p>
          <p className="mt-1 text-gray-800">
            {clinical.doctorNotes || "— none —"}
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-600">Vitals</p>
          <div className="mt-1 text-gray-800 text-sm">
            <div>Blood pressure: {vitals.bp || "—"}</div>
            <div>Heart rate: {vitals.hr || "—"}</div>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          Finalized at:{" "}
          {clinical.finalizedAt
            ? new Date(clinical.finalizedAt).toLocaleString()
            : "—"}
        </div>
      </div>

      {/* Bottom half: attachments with Analyze button */}
      <div className="bg-white border rounded p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Attachments</h3>
          <button
            // placeholder for future AI analyze feature
            onClick={() => {
              toast.info("Analyze Image: feature not implemented yet");
            }}
            className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
          >
            Analyze Image
          </button>
        </div>

        {attachments.length === 0 ? (
          <div className="text-gray-500">No attachments.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {attachments.map((a, i) => (
              <div
                key={i}
                className="border rounded overflow-hidden shadow-sm bg-gray-50"
              >
                <div className="h-48 flex items-center justify-center bg-white">
                  {a.type?.startsWith?.("image") ? (
                    <img
                      src={a.url}
                      alt={a.filename || `attachment-${i}`}
                      className="max-h-full"
                    />
                  ) : (
                    <div className="p-4 text-sm text-gray-600">
                      {a.filename || a.url}
                    </div>
                  )}
                </div>
                <div className="p-3 flex items-center justify-between">
                  <div className="text-sm text-gray-700 break-words max-w-[70%]">
                    {a.filename || a.url}
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 border rounded text-xs hover:bg-gray-100"
                    >
                      Open
                    </a>
                    <a
                      href={a.url}
                      download
                      className="px-2 py-1 border rounded text-xs hover:bg-gray-100"
                    >
                      Download
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorAppointmentDetails;
