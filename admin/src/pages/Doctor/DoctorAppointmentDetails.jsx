// admin/src/pages/Doctor/DoctorAppointmentDetails.jsx
import React, { useContext, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";
import { assets } from "../../assets/assets";

const DoctorAppointmentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dToken, backendUrl } = useContext(DoctorContext);
  const { slotDateFormat, currency } = useContext(AppContext);

  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // pdf downloading
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // upload state
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  // deleting attachment id/url (to show spinner / disable)
  const [deletingAttachment, setDeletingAttachment] = useState(null);

  // editing states
  const [globalEdit, setGlobalEdit] = useState(false);
  const [tempClinical, setTempClinical] = useState({});
  const [savingSection, setSavingSection] = useState(null); // which section is being saved (or 'all')

  // ---------------------------
  // Auth header helper (robust)
  // ---------------------------
  const getAuthToken = () => {
    return (
      dToken ||
      localStorage.getItem("dToken") ||
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      ""
    );
  };

  const getAuthHeaders = () => {
    const token = getAuthToken();
    const headers = {};
    if (token) {
      headers.dToken = token;
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  // ---------------------------
  // load appointment
  // ---------------------------
  const fetchAppointment = async (aptId) => {
    if (!aptId) return;
    const token = getAuthToken();
    if (!token) {
      console.warn("fetchAppointment: no token available yet");
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      const { data } = await axios.get(
        `${backendUrl}/api/records/appointments/${aptId}`,
        {
          headers: getAuthHeaders(),
        },
      );
      if (data?.success && data.appointment) {
        setAppointment(data.appointment);
        setTempClinical(data.appointment.clinical || {});
      } else {
        const msg = data?.message || "Failed to load appointment";
        setErr(msg);
        toast.error(msg);
      }
    } catch (error) {
      console.error("fetch appointment details error", error);
      const serverMsg =
        error?.response?.data?.message ||
        error?.response?.data ||
        error?.message ||
        "Failed to fetch appointment";
      setErr(serverMsg);
      toast.error(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  // Only attempt fetch when we have a token (prevents firing a request with undefined token)
  useEffect(() => {
    if (!id) return;
    const token = getAuthToken();
    if (!token) {
      const t = setTimeout(() => fetchAppointment(id), 500);
      return () => clearTimeout(t);
    }
    fetchAppointment(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dToken]);

  // keep tempClinical synced when appointment reloads from server
  useEffect(() => {
    if (appointment) {
      setTempClinical(appointment.clinical || {});
    }
  }, [appointment]);

  // convenience & safe fallbacks
  const clinical = appointment?.clinical || {};
  const attachments = Array.isArray(clinical.attachments)
    ? clinical.attachments
    : [];
  const prescriptions = Array.isArray(clinical.prescriptions)
    ? clinical.prescriptions
    : [];

  // file upload helpers
  const openFile = () => {
    if (fileRef.current) fileRef.current.click();
  };

  const onFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const f of files) {
      await upload(f);
    }
    e.target.value = "";
  };

  const upload = async (file) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const { data } = await axios.post(
        `${backendUrl}/api/records/appointments/${id}/attachments`,
        form,
        {
          headers: {
            ...getAuthHeaders(),
            "Content-Type": "multipart/form-data",
          },
        },
      );

      if (data.success) {
        const fileObj = data.file || data;
        const normalized = {
          url:
            fileObj.url ||
            fileObj.secure_url ||
            fileObj.path ||
            fileObj.file ||
            "",
          filename:
            fileObj.filename ||
            fileObj.original_filename ||
            fileObj.name ||
            file.name,
          type:
            fileObj.type ||
            fileObj.resource_type ||
            fileObj.format ||
            file.type ||
            undefined,
          uploadedBy: fileObj.uploadedBy || undefined,
          uploadedAt: fileObj.uploadedAt
            ? new Date(fileObj.uploadedAt)
            : new Date(),
          fileId:
            fileObj.fileId || fileObj._id || fileObj.id || fileObj.public_id,
        };

        setAppointment((prev) => {
          if (!prev) return prev;
          const clinicalCopy = { ...(prev.clinical || {}) };
          clinicalCopy.attachments = [
            ...(clinicalCopy.attachments || []),
            normalized,
          ];
          return { ...prev, clinical: clinicalCopy };
        });

        setTempClinical((prev) => {
          const copy = { ...(prev || {}) };
          copy.attachments = [...(copy.attachments || []), normalized];
          return copy;
        });

        toast.success("Attachment uploaded");
      } else {
        throw new Error(data.message || "Upload failed");
      }
    } catch (err) {
      console.error("upload error", err);
      const msg = err?.response?.data?.message || err.message || String(err);
      toast.error("Upload failed: " + msg);
    } finally {
      setUploading(false);
    }
  };

  // ---------- Delete attachment helper ----------
  const deleteAttachment = async (att) => {
    const fileId =
      att.fileId || att._id || att.id || att.public_id || undefined;
    const confirmed = window.confirm(
      "Delete this attachment? This action cannot be undone.",
    );
    if (!confirmed) return;

    const deletingKey = fileId || att.url;
    setDeletingAttachment(deletingKey);

    try {
      const url = fileId
        ? `${backendUrl}/api/records/appointments/${appointment._id}/attachments/${encodeURIComponent(
            String(fileId),
          )}`
        : `${backendUrl}/api/records/appointments/${appointment._id}/attachments`;

      const config = {
        headers: getAuthHeaders(),
        data: fileId ? undefined : { url: att.url },
      };

      const { data } = await axios.delete(url, config);

      if (data?.success) {
        if (data.appointment) {
          setAppointment(data.appointment);
          setTempClinical(data.appointment.clinical || {});
        } else {
          const matches = (a) =>
            (a.fileId && fileId && String(a.fileId) === String(fileId)) ||
            (a._id && fileId && String(a._id) === String(fileId)) ||
            (a.url && a.url === att.url);
          setAppointment((prev) => {
            if (!prev) return prev;
            const copy = { ...prev };
            copy.clinical = copy.clinical || {};
            copy.clinical.attachments = (
              copy.clinical.attachments || []
            ).filter((a) => !matches(a));
            return copy;
          });
          setTempClinical((prev) => {
            if (!prev) return prev;
            const copy = { ...prev };
            copy.attachments = (copy.attachments || []).filter(
              (a) => !matches(a),
            );
            return copy;
          });
        }
        toast.success("Attachment deleted");
      } else {
        throw new Error(data?.message || "Delete failed");
      }
    } catch (err) {
      console.error("deleteAttachment error:", err);
      toast.error(
        err?.response?.data?.message || err.message || "Failed to delete",
      );
    } finally {
      setDeletingAttachment(null);
    }
  };

  // ---------- PDF download helper ----------
  const downloadPdf = async (mode = "full") => {
    if (!appointment) return;
    setDownloadingPdf(true);
    try {
      const resp = await axios.get(
        `${backendUrl}/api/records/appointments/${appointment._id}/pdf?mode=${encodeURIComponent(
          mode,
        )}`,
        {
          headers: getAuthHeaders(),
          responseType: "blob",
        },
      );
      const contentType = resp.headers["content-type"] || "application/pdf";
      const url = window.URL.createObjectURL(
        new Blob([resp.data], { type: contentType }),
      );
      const a = document.createElement("a");
      a.href = url;
      const suffix = mode === "ticket" ? "ticket" : "full";
      a.download = `appointment_${appointment._id}_${suffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("downloadPdf error:", err);
      toast.error("Failed to download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ---------- Editing helpers (save) ----------
  const saveSection = async (section) => {
    if (!appointment) return;
    setSavingSection(section || "all");
    try {
      const payload = {};
      if (section === "diagnosis") {
        payload.diagnosis = tempClinical.diagnosis || { text: "" };
      } else if (section === "prescriptions") {
        payload.prescriptions = tempClinical.prescriptions || [];
      } else if (section === "doctorNotes") {
        payload.doctorNotes = tempClinical.doctorNotes || "";
      } else if (section === "vitals") {
        payload.vitals = tempClinical.vitals || {};
      } else {
        payload.diagnosis = tempClinical.diagnosis || { text: "" };
        payload.prescriptions = tempClinical.prescriptions || [];
        payload.doctorNotes = tempClinical.doctorNotes || "";
        payload.vitals = tempClinical.vitals || {};
      }

      const attachSource =
        tempClinical.attachments ??
        appointment.clinical?.attachments ??
        attachments ??
        [];
      payload.attachments = attachSource.map((a) => {
        if (!a || typeof a === "string") return a;
        return {
          ...a,
          fileId:
            a.fileId || a._id || a.id || a.public_id || a.file_id || undefined,
        };
      });

      const { data } = await axios.post(
        `${backendUrl}/api/records/appointments/${appointment._id}/finish`,
        payload,
        {
          headers: getAuthHeaders(),
        },
      );

      if (data?.success && data?.appointment) {
        setAppointment(data.appointment);
        setTempClinical(data.appointment.clinical || {});
      } else if (data?.success && !data?.appointment) {
        await fetchAppointment(appointment._id);
      } else if (!data?.success) {
        throw new Error(data?.message || "Save failed");
      }

      toast.success("Saved");
      // close global edit if saved all
      if (!section || section === "all") {
        setGlobalEdit(false);
      }
    } catch (error) {
      console.error("saveSection error:", error);
      const msg =
        error?.response?.data?.message || error?.message || String(error);
      toast.error("Save failed: " + msg);
    } finally {
      setSavingSection(null);
    }
  };

  // ---------- small local helpers for editing ----------
  function createEmptyRx() {
    return {
      name: "",
      form: "",
      dose: "",
      frequency: "",
      duration: "",
      instructions: "",
      createdAt: new Date(),
    };
  }

  const setDiagnosisText = (v) =>
    setTempClinical((prev) => ({
      ...(prev || {}),
      diagnosis: { ...(prev?.diagnosis || {}), text: v },
    }));
  const setDoctorNotesLocal = (v) =>
    setTempClinical((prev) => ({ ...(prev || {}), doctorNotes: v }));
  const addPrescription = () =>
    setTempClinical((prev) => {
      const list = [...(prev?.prescriptions || [])];
      list.push(createEmptyRx());
      return { ...(prev || {}), prescriptions: list };
    });
  const updatePrescription = (index, key, value) =>
    setTempClinical((prev) => {
      const list = [...(prev?.prescriptions || [])];
      list[index] = { ...(list[index] || {}), [key]: value };
      return { ...(prev || {}), prescriptions: list };
    });
  const removePrescription = (index) =>
    setTempClinical((prev) => {
      const list = [...(prev?.prescriptions || [])];
      list.splice(index, 1);
      return { ...(prev || {}), prescriptions: list };
    });

  // ---------- UI helpers ----------
  const enterGlobalEdit = () => {
    setTempClinical(appointment.clinical || {});
    setGlobalEdit(true);
  };
  const cancelGlobalEdit = () => {
    setTempClinical(appointment.clinical || {});
    setGlobalEdit(false);
  };

  // helper to render empty-ish values as underscore-like line
  const renderValue = (v) => {
    if (
      v === null ||
      v === undefined ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0)
    ) {
      return <span className="text-gray-400 select-none">__________</span>;
    }
    // if it's an object or array, stringify small
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return v;
  };

  // ---------- Render guards ----------
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
        <h3 className="text-lg font-medium mb-2">No appointment selected</h3>
        <pre className="p-3 bg-gray-100 text-xs rounded max-w-full overflow-auto">
          {JSON.stringify(
            { id, dTokenPresent: !!getAuthToken(), loading, err },
            null,
            2,
          )}
        </pre>
        <div className="mt-3">
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1 border rounded"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const completed = !!appointment.isCompleted;

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
          <button
            onClick={() => downloadPdf(completed ? "full" : "ticket")}
            disabled={downloadingPdf}
            className="px-3 py-1 border rounded bg-primary text-white hover:opacity-95"
          >
            {downloadingPdf
              ? "Downloading..."
              : completed
                ? "Download PDF"
                : "Download ticket"}
          </button>
        </div>
      </div>

      {/* Top half: clinical info */}
      <div className="bg-white border rounded p-5 mb-4 space-y-6 shadow-sm">
        <div>
          <h3 className="text-lg font-medium">Clinical notes</h3>
          <div className="text-xs text-gray-500 mt-1">
            Edit the whole section and save all changes at once.
          </div>
        </div>

        {/* Diagnosis */}
        <div>
          <div className="mb-2">
            <h4 className="font-medium">Diagnosis</h4>
          </div>
          {!globalEdit ? (
            <div className="p-3 bg-gray-50 rounded min-h-[70px] text-sm whitespace-pre-wrap">
              {renderValue(appointment.clinical?.diagnosis?.text)}
            </div>
          ) : (
            <textarea
              value={tempClinical?.diagnosis?.text || ""}
              onChange={(e) => setDiagnosisText(e.target.value)}
              className="w-full p-2 border rounded min-h-[80px]"
            />
          )}
        </div>

        {/* Prescriptions */}
        <div>
          <div className="mb-2">
            <h4 className="font-medium">Prescriptions</h4>
          </div>

          {!globalEdit ? (
            <div className="p-3 bg-gray-50 rounded space-y-2">
              {prescriptions.length === 0 ? (
                <div className="text-sm text-gray-500">No prescriptions.</div>
              ) : (
                prescriptions.map((p, idx) => (
                  <div
                    key={idx}
                    className="border rounded p-2 bg-white text-sm"
                  >
                    <div className="flex flex-wrap gap-3">
                      <div className="min-w-[160px]">
                        <strong className="block text-xs text-gray-600">
                          Name
                        </strong>
                        <div>{renderValue(p.name)}</div>
                      </div>
                      <div className="min-w-[120px]">
                        <strong className="block text-xs text-gray-600">
                          Form
                        </strong>
                        <div>{renderValue(p.form)}</div>
                      </div>
                      <div className="min-w-[100px]">
                        <strong className="block text-xs text-gray-600">
                          Dose
                        </strong>
                        <div>{renderValue(p.dose)}</div>
                      </div>
                      <div className="min-w-[120px]">
                        <strong className="block text-xs text-gray-600">
                          Frequency
                        </strong>
                        <div>{renderValue(p.frequency)}</div>
                      </div>
                      <div className="min-w-[100px]">
                        <strong className="block text-xs text-gray-600">
                          Duration
                        </strong>
                        <div>{renderValue(p.duration)}</div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <strong className="block text-xs text-gray-600">
                        Instructions
                      </strong>
                      <div className="text-sm">
                        {renderValue(p.instructions)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="p-2 bg-gray-50 rounded space-y-3">
              {(tempClinical.prescriptions || []).map((p, idx) => (
                <div
                  key={idx}
                  className="border rounded-lg p-3 bg-white space-y-2"
                >
                  <div className="flex gap-2">
                    <input
                      value={p.name || ""}
                      onChange={(e) =>
                        updatePrescription(idx, "name", e.target.value)
                      }
                      placeholder="Drug name"
                      className="border rounded p-2 flex-1"
                    />
                    <input
                      value={p.form || ""}
                      onChange={(e) =>
                        updatePrescription(idx, "form", e.target.value)
                      }
                      placeholder="Form (e.g. tablet)"
                      className="border rounded p-2 w-36"
                    />
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={p.dose || ""}
                      onChange={(e) =>
                        updatePrescription(idx, "dose", e.target.value)
                      }
                      placeholder="Dose (e.g. 500 mg)"
                      className="border rounded p-2 w-40"
                    />
                    <input
                      value={p.frequency || ""}
                      onChange={(e) =>
                        updatePrescription(idx, "frequency", e.target.value)
                      }
                      placeholder="Frequency (e.g. twice daily)"
                      className="border rounded p-2 flex-1"
                    />
                    <input
                      value={p.duration || ""}
                      onChange={(e) =>
                        updatePrescription(idx, "duration", e.target.value)
                      }
                      placeholder="Duration (e.g. 5 days)"
                      className="border rounded p-2 w-36"
                    />
                  </div>

                  <div>
                    <input
                      value={p.instructions || ""}
                      onChange={(e) =>
                        updatePrescription(idx, "instructions", e.target.value)
                      }
                      placeholder="Instructions (optional)"
                      className="border rounded p-2 w-full"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => removePrescription(idx)}
                      className="text-red-600 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <div>
                <button
                  onClick={addPrescription}
                  className="px-2 py-1 border rounded text-sm"
                  type="button"
                >
                  + Add prescription
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Doctor notes */}
        <div>
          <div className="mb-2">
            <h4 className="font-medium">Doctor notes</h4>
          </div>

          {!globalEdit ? (
            <div className="p-3 bg-gray-50 rounded min-h-[70px] text-sm whitespace-pre-wrap">
              {renderValue(appointment.clinical?.doctorNotes)}
            </div>
          ) : (
            <textarea
              value={tempClinical?.doctorNotes || ""}
              onChange={(e) => setDoctorNotesLocal(e.target.value)}
              className="w-full p-2 border rounded min-h-[80px]"
            />
          )}
        </div>

        {/* Vitals */}
        <div>
          <div className="mb-2">
            <h4 className="font-medium">Vitals</h4>
          </div>

          {!globalEdit ? (
            <div className="p-3 bg-gray-50 rounded text-sm">
              {appointment.clinical?.vitals &&
              Object.keys(appointment.clinical.vitals).length ? (
                <div>
                  {Object.entries(appointment.clinical.vitals).map(([k, v]) => (
                    <div key={k}>
                      <strong className="capitalize mr-1">{k}:</strong>{" "}
                      <span>{renderValue(String(v))}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">{renderValue(null)}</div>
              )}
            </div>
          ) : (
            <div className="p-2 bg-gray-50 rounded space-y-2">
              <div className="flex gap-2">
                <input
                  value={tempClinical?.vitals?.bp || ""}
                  onChange={(e) =>
                    setTempClinical((prev) => ({
                      ...(prev || {}),
                      vitals: { ...(prev?.vitals || {}), bp: e.target.value },
                    }))
                  }
                  placeholder="Blood pressure"
                  className="p-1 border rounded flex-1"
                />
                <input
                  value={tempClinical?.vitals?.hr || ""}
                  onChange={(e) =>
                    setTempClinical((prev) => ({
                      ...(prev || {}),
                      vitals: { ...(prev?.vitals || {}), hr: e.target.value },
                    }))
                  }
                  placeholder="Heart rate"
                  className="p-1 border rounded w-28"
                />
                <input
                  value={tempClinical?.vitals?.temp || ""}
                  onChange={(e) =>
                    setTempClinical((prev) => ({
                      ...(prev || {}),
                      vitals: { ...(prev?.vitals || {}), temp: e.target.value },
                    }))
                  }
                  placeholder="Temp"
                  className="p-1 border rounded w-24"
                />
              </div>
            </div>
          )}
        </div>

        {/* bottom edit controls (user requested edit button at bottom of the section) */}
        <div className="mt-4 border-t pt-4 flex items-center justify-end gap-3">
          {!globalEdit ? (
            <button
              onClick={enterGlobalEdit}
              className="px-3 py-1 border rounded text-sm bg-white hover:bg-gray-50"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                onClick={() => saveSection("all")}
                disabled={savingSection === "all"}
                className="px-3 py-1 border rounded bg-primary text-white text-sm"
              >
                {savingSection === "all" ? "Saving..." : "Save all"}
              </button>
              <button
                onClick={cancelGlobalEdit}
                className="px-3 py-1 border rounded text-sm bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom half: attachments */}
      <div className="bg-white border rounded p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Attachments</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {attachments.length === 0 ? (
            <div className="col-span-full p-6 bg-gray-50 border rounded h-56 flex flex-col items-center justify-center">
              <div className="text-gray-500 text-lg mb-2">No attachments.</div>
              <div className="mt-4">
                <button
                  onClick={openFile}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 border rounded bg-primary text-white"
                >
                  {uploading ? "Uploading..." : "Add attachment"}
                </button>
              </div>
              <div className="mt-3 text-sm text-gray-500">
                Attach images or documents related to this visit.
              </div>
            </div>
          ) : (
            <>
              {attachments.map((att, i) => {
                const isImage = att.type?.startsWith?.("image");
                const fileId =
                  att.fileId || att._id || att.id || att.public_id || null;
                const deletingKey = fileId || att.url;
                const key = fileId || att.url || `att-${i}`;
                return (
                  <div
                    key={key}
                    className="border rounded overflow-hidden bg-white flex flex-col"
                  >
                    <div className="flex-1 min-h-[160px] flex items-center justify-center bg-gray-50 p-3">
                      {isImage ? (
                        <img
                          src={att.url}
                          alt={att.filename || `attachment-${i}`}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="p-2 text-sm text-gray-600 truncate">
                          {att.filename || att.url}
                        </div>
                      )}
                    </div>

                    <div className="px-3 py-3 border-t bg-white">
                      <div className="mb-2">
                        <div className="text-sm font-medium text-gray-800 truncate">
                          {att.filename || att.url || "Attachment"}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {(att.uploadedAt &&
                            new Date(att.uploadedAt).toLocaleString()) ||
                            ""}
                        </div>
                      </div>

                      {/* Action buttons: stacked full width below filename (prevents cropping) */}
                      <div className="flex flex-col gap-2">
                        {fileId ? (
                          <Link
                            to={`/doctor/attachment/${appointment._id}/${fileId}`}
                            className="w-full text-center px-3 py-2 border rounded text-sm hover:bg-gray-50"
                          >
                            Open
                          </Link>
                        ) : (
                          <button
                            disabled
                            title="No file id"
                            className="w-full text-center px-3 py-2 border rounded text-sm opacity-50 cursor-not-allowed"
                          >
                            Open
                          </button>
                        )}

                        <a
                          href={att.url}
                          download
                          className="w-full text-center px-3 py-2 border rounded text-sm hover:bg-gray-50"
                        >
                          Download
                        </a>

                        <button
                          onClick={() => deleteAttachment(att)}
                          disabled={deletingAttachment === deletingKey}
                          className="w-full text-center px-3 py-2 border rounded text-sm text-red-600 hover:bg-red-50"
                        >
                          {deletingAttachment === deletingKey
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add new attachment card */}
              <div
                className="flex flex-col items-center justify-center border rounded p-4 cursor-pointer hover:shadow h-56"
                onClick={openFile}
                role="button"
                aria-label="Add attachment"
              >
                <img
                  src={assets.plus_icon100}
                  alt="Add"
                  className="w-16 h-16"
                />
                <div className="mt-2 text-sm font-medium text-gray-700">
                  Add
                </div>
                <div className="text-xs text-gray-500">
                  {uploading ? "Uploading..." : "Click to add file"}
                </div>
              </div>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          className="hidden"
          multiple
          onChange={onFile}
        />
      </div>
    </div>
  );
};

export default DoctorAppointmentDetails;
