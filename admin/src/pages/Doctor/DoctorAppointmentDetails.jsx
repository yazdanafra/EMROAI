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

  // upload state
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  // editing states
  const [editModes, setEditModes] = useState({
    diagnosis: false,
    prescriptions: false,
    doctorNotes: false,
    vitals: false,
  });
  const [globalEdit, setGlobalEdit] = useState(false);
  const [tempClinical, setTempClinical] = useState({});
  const [savingSection, setSavingSection] = useState(null); // which section is being saved (or 'all')

  // load appointment
  const fetchAppointment = async (aptId) => {
    if (!aptId) return;
    setLoading(true);
    setErr(null);
    try {
      const { data } = await axios.get(
        `${backendUrl}/api/records/appointments/${aptId}`,
        {
          headers: { Authorization: `Bearer ${dToken}` },
        },
      );
      if (data?.success && data.appointment) {
        setAppointment(data.appointment);
        setTempClinical(data.appointment.clinical || {});
      } else if (
        data?.success &&
        data?.appointment === undefined &&
        data?.appointment !== null
      ) {
        setErr("Server returned unexpected response");
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
      if (error?.response?.status === 401) {
        navigate(-1);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
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
  const diagnosis =
    clinical.diagnosis && typeof clinical.diagnosis === "object"
      ? clinical.diagnosis
      : { text: "", codes: [] };
  const diagnosisCodes = Array.isArray(diagnosis.codes) ? diagnosis.codes : [];
  const vitals =
    clinical.vitals && typeof clinical.vitals === "object"
      ? clinical.vitals
      : {};
  // tempClinical safe accessors
  const diagnosisText =
    tempClinical?.diagnosis && typeof tempClinical.diagnosis === "object"
      ? tempClinical.diagnosis.text || ""
      : String(tempClinical?.diagnosis || "");
  const prescriptionsList = Array.isArray(tempClinical?.prescriptions)
    ? tempClinical.prescriptions
    : [];
  const doctorNotes = tempClinical?.doctorNotes || "";
  const vitalsObj =
    tempClinical?.vitals && typeof tempClinical.vitals === "object"
      ? tempClinical.vitals
      : {};

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
          headers: { Authorization: `Bearer ${dToken}` },
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
          // keep whatever id the backend returned
          fileId:
            fileObj.fileId || fileObj._id || fileObj.id || fileObj.public_id,
        };

        // append to appointment state so the UI updates
        setAppointment((prev) => {
          if (!prev) return prev;
          const clinicalCopy = { ...(prev.clinical || {}) };
          clinicalCopy.attachments = [
            ...(clinicalCopy.attachments || []),
            normalized,
          ];
          return { ...prev, clinical: clinicalCopy };
        });

        // also update tempClinical (so UI stays in-sync if editing other sections)
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

  // ---------- Editing helpers ----------
  const enterGlobalEdit = () => {
    setEditModes({
      diagnosis: true,
      prescriptions: true,
      doctorNotes: true,
      vitals: true,
    });
    setGlobalEdit(true);
  };

  const cancelGlobalEdit = () => {
    // revert tempClinical to appointment.clinical
    setTempClinical(() => ({ ...(appointment?.clinical || {}) }));
    setEditModes({
      diagnosis: false,
      prescriptions: false,
      doctorNotes: false,
      vitals: false,
    });
    setGlobalEdit(false);
  };

  // generic save: can save a single section or all (we use here for 'all')
  const saveSection = async (section) => {
    if (!appointment) return;
    setSavingSection(section);
    try {
      const payload = {};

      // attach the fields requested (backend will parse/normalize)
      if (section === "diagnosis") {
        payload.diagnosis = tempClinical.diagnosis || { text: "" };
      } else if (section === "prescriptions") {
        payload.prescriptions = tempClinical.prescriptions || [];
      } else if (section === "doctorNotes") {
        payload.doctorNotes = tempClinical.doctorNotes || "";
      } else if (section === "vitals") {
        payload.vitals = tempClinical.vitals || {};
      } else {
        // "all"
        payload.diagnosis = tempClinical.diagnosis || { text: "" };
        payload.prescriptions = tempClinical.prescriptions || [];
        payload.doctorNotes = tempClinical.doctorNotes || "";
        payload.vitals = tempClinical.vitals || {};
      }

      // --- IMPORTANT: send attachments too, but normalize id keys to fileId ---
      const attachSource =
        tempClinical.attachments ??
        appointment.clinical?.attachments ??
        attachments ??
        [];

      payload.attachments = attachSource.map((a) => {
        if (!a || typeof a === "string") return a; // keep strings as-is
        return {
          ...a,
          // normalize possible ID fields into fileId
          fileId:
            a.fileId || a._id || a.id || a.public_id || a.file_id || undefined,
        };
      });

      const { data } = await axios.post(
        `${backendUrl}/api/records/appointments/${appointment._id}/finish`,
        payload,
        {
          headers: { Authorization: `Bearer ${dToken}` },
        },
      );

      // Important: only set appointment from returned object if server returned a real appointment
      if (data?.success && data?.appointment) {
        setAppointment(data.appointment);
        setTempClinical(data.appointment.clinical || {});
      } else if (data?.success && !data?.appointment) {
        // server didn't return appointment — re-fetch authoritative copy
        await fetchAppointment(appointment._id);
      } else if (!data?.success) {
        throw new Error(data?.message || "Save failed");
      }

      toast.success("Saved");

      // if saved all, exit global edit; otherwise only toggle that section
      if (section === "all") {
        setEditModes({
          diagnosis: false,
          prescriptions: false,
          doctorNotes: false,
          vitals: false,
        });
        setGlobalEdit(false);
      } else {
        setEditModes((s) => ({ ...s, [section]: false }));
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

  // ---------- small state helpers ----------
  const setDiagnosisText = (v) =>
    setTempClinical((prev) => ({
      ...(prev || {}),
      diagnosis: { ...(prev?.diagnosis || {}), text: v },
    }));

  const setDoctorNotes = (v) =>
    setTempClinical((prev) => ({ ...(prev || {}), doctorNotes: v }));

  const setVitalsField = (key, value) =>
    setTempClinical((prev) => ({
      ...(prev || {}),
      vitals: { ...(prev?.vitals || {}), [key]: value },
    }));

  const addPrescription = () =>
    setTempClinical((prev) => {
      const list = [...(prev?.prescriptions || [])];
      list.push({
        name: "",
        form: "",
        dose: "",
        frequency: "",
        duration: "",
        instructions: "",
        prescribedBy: null,
        createdAt: new Date(),
      });
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
            { id, dTokenPresent: !!dToken, loading, err },
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
      <div className="bg-white border rounded p-5 mb-4 space-y-6">
        {/* Diagnosis */}
        <div>
          <div className="mb-2">
            <h3 className="font-medium">Diagnosis</h3>
          </div>

          {!editModes.diagnosis ? (
            <p className="text-gray-800">
              {diagnosis?.text || "— no diagnosis provided —"}
            </p>
          ) : (
            <textarea
              rows={4}
              value={diagnosisText}
              onChange={(e) => setDiagnosisText(e.target.value)}
              className="w-full border rounded p-2 text-sm"
            />
          )}

          {/* codes preview (read-only) */}
          {diagnosisCodes.length > 0 && (
            <div className="mt-2 text-xs text-gray-600">
              Codes:
              <ul className="list-disc list-inside">
                {diagnosisCodes.map((c, i) => (
                  <li key={i}>
                    {c.system || ""} {c.code ? `: ${c.code}` : ""}{" "}
                    {c.display ? `(${c.display})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Prescriptions */}
        <div>
          <div className="mb-2">
            <h3 className="font-medium">Prescriptions</h3>
          </div>

          {!editModes.prescriptions ? (
            prescriptions.length === 0 ? (
              <p className="text-gray-800">— none —</p>
            ) : (
              <div className="space-y-2">
                {prescriptions.map((p, i) => (
                  <div
                    key={i}
                    className="p-2 border rounded bg-gray-50 text-sm"
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
            )
          ) : (
            <div className="space-y-3">
              {prescriptionsList.map((p, i) => (
                <div key={i} className="p-3 border rounded bg-gray-50">
                  <div className="flex gap-2 mb-2">
                    <input
                      placeholder="Name"
                      value={p.name || ""}
                      onChange={(e) =>
                        updatePrescription(i, "name", e.target.value)
                      }
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                    <input
                      placeholder="Form"
                      value={p.form || ""}
                      onChange={(e) =>
                        updatePrescription(i, "form", e.target.value)
                      }
                      className="w-28 px-2 py-1 border rounded text-sm"
                    />
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      placeholder="Dose"
                      value={p.dose || ""}
                      onChange={(e) =>
                        updatePrescription(i, "dose", e.target.value)
                      }
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                    <input
                      placeholder="Frequency"
                      value={p.frequency || ""}
                      onChange={(e) =>
                        updatePrescription(i, "frequency", e.target.value)
                      }
                      className="w-36 px-2 py-1 border rounded text-sm"
                    />
                    <input
                      placeholder="Duration"
                      value={p.duration || ""}
                      onChange={(e) =>
                        updatePrescription(i, "duration", e.target.value)
                      }
                      className="w-36 px-2 py-1 border rounded text-sm"
                    />
                  </div>
                  <textarea
                    placeholder="Instructions"
                    rows={2}
                    value={p.instructions || ""}
                    onChange={(e) =>
                      updatePrescription(i, "instructions", e.target.value)
                    }
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => removePrescription(i)}
                      className="px-2 py-1 text-sm border rounded text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <div>
                <button
                  onClick={addPrescription}
                  className="px-3 py-1 border rounded text-sm"
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
            <h3 className="font-medium">Doctor notes</h3>
          </div>

          {!editModes.doctorNotes ? (
            <p className="text-gray-800">
              {clinical.doctorNotes || "— none —"}
            </p>
          ) : (
            <textarea
              rows={4}
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              className="w-full border rounded p-2 text-sm"
            />
          )}
        </div>

        {/* Vitals */}
        <div>
          <div className="mb-2">
            <h3 className="font-medium">Vitals</h3>
          </div>

          {!editModes.vitals ? (
            <div className="mt-1 text-gray-800 text-sm">
              <div>Blood pressure: {vitals.bp || "—"}</div>
              <div>Heart rate: {vitals.hr || "—"}</div>
              {/* display other vitals if present */}
              {Object.keys(vitals).map((k) =>
                k === "bp" || k === "hr" ? null : (
                  <div key={k}>
                    {k}: {String(vitals[k])}
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                placeholder="Blood pressure (e.g. 120/80)"
                value={vitalsObj.bp || ""}
                onChange={(e) => setVitalsField("bp", e.target.value)}
                className="px-2 py-1 border rounded text-sm"
              />
              <input
                placeholder="Heart rate (bpm)"
                value={vitalsObj.hr || ""}
                onChange={(e) => setVitalsField("hr", e.target.value)}
                className="px-2 py-1 border rounded text-sm"
              />
            </div>
          )}
        </div>

        <div className="mt-2 text-xs text-gray-500">
          Finalized at:{" "}
          {clinical.finalizedAt
            ? new Date(clinical.finalizedAt).toLocaleString()
            : "—"}
        </div>

        {/* GLOBAL edit controls (single Edit / Save / Cancel) placed at the end of the clinical container */}
        <div className="flex justify-end gap-2 mt-3">
          {!globalEdit ? (
            <button
              onClick={enterGlobalEdit}
              className="px-3 py-1 border rounded text-sm"
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
                {savingSection === "all" ? "Saving..." : "Save"}
              </button>
              <button
                onClick={cancelGlobalEdit}
                disabled={savingSection === "all"}
                className="px-3 py-1 border rounded text-sm"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom half: attachments with Analyze and Add button */}
      <div className="bg-white border rounded p-5 min-h-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Attachments</h3>
        </div>

        {/* grid: show the big placeholder when no attachments, otherwise show attachments + plus tile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 auto-rows-fr">
          {attachments.length === 0 ? (
            <div className="col-span-full p-6 bg-gray-50 border rounded min-h-64 flex flex-col items-center justify-center">
              <div className="text-gray-500 text-lg">No attachments.</div>
              <div className="mt-4 flex justify-center">
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
                return (
                  <div
                    key={i}
                    className="border rounded overflow-hidden shadow-sm bg-gray-50 min-h-56 flex flex-col"
                  >
                    <div className="flex-1 h-48 flex items-center justify-center bg-white">
                      {isImage ? (
                        <img
                          src={att.url}
                          alt={att.filename || `attachment-${i}`}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="p-4 text-sm text-gray-600">
                          {att.filename || att.url}
                        </div>
                      )}
                    </div>
                    <div className="p-3 flex items-center justify-between">
                      <div className="text-sm text-gray-700 break-words max-w-[70%]">
                        {att.filename || att.url}
                      </div>
                      <div className="flex gap-2">
                        {fileId ? (
                          <Link
                            to={`/doctor/attachment/${appointment._id}/${fileId}`}
                            className="px-2 py-1 border rounded text-xs hover:bg-gray-100"
                          >
                            Open
                          </Link>
                        ) : (
                          <button
                            disabled
                            title="No file id"
                            className="px-2 py-1 border rounded text-xs opacity-50 cursor-not-allowed"
                          >
                            Open
                          </button>
                        )}
                        <a
                          href={att.url}
                          download
                          className="px-2 py-1 border rounded text-xs hover:bg-gray-100"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* plus tile (visible only when attachments exist) */}
              <div
                className="flex flex-col items-center justify-center border rounded p-4 cursor-pointer hover:shadow min-h-56"
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
