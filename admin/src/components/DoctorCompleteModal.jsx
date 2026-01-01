import React, { useEffect, useState } from "react";

export default function DoctorCompleteModal({
  appointment,
  onClose,
  onSaved,
  authToken,
}) {
  // backend base URL (use env var in frontend or fallback)
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

  // appointment: the object for this appointment (must have _id and docId etc.)
  function createEmptyRx() {
    return {
      name: "",
      form: "",
      dose: "",
      frequency: "",
      duration: "",
      instructions: "",
    };
  }

  const [diagnosisText, setDiagnosisText] = useState(
    appointment?.clinical?.diagnosis?.text || ""
  );
  const [diagnosisCodes, setDiagnosisCodes] = useState(
    appointment?.clinical?.diagnosis?.codes || []
  );
  const [prescriptions, setPrescriptions] = useState(
    appointment?.clinical?.prescriptions || [createEmptyRx()]
  );
  const [doctorNotes, setDoctorNotes] = useState(
    appointment?.clinical?.doctorNotes || ""
  );
  const [bp, setBp] = useState(appointment?.clinical?.vitals?.bp || "");
  const [hr, setHr] = useState(appointment?.clinical?.vitals?.hr || "");
  const [files, setFiles] = useState([]); // File objects selected by user
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // ensure at least one prescription row
    if (!prescriptions || prescriptions.length === 0)
      setPrescriptions([createEmptyRx()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // prefer token passed as prop, then try localStorage fallback
  function resolveToken() {
    if (typeof authToken !== "undefined" && authToken) return authToken;
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      localStorage.getItem("accessToken") ||
      null
    );
  }

  function addPrescription() {
    setPrescriptions((p) => [...p, createEmptyRx()]);
  }

  function removePrescription(index) {
    setPrescriptions((p) => p.filter((_, i) => i !== index));
  }

  function updatePrescription(index, key, value) {
    setPrescriptions((p) =>
      p.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    );
  }

  function addDiagnosisCode() {
    setDiagnosisCodes((c) => [
      ...c,
      { system: "ICD-10", code: "", display: "" },
    ]);
  }

  function updateDiagnosisCode(index, key, value) {
    setDiagnosisCodes((c) =>
      c.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    );
  }

  function removeDiagnosisCode(index) {
    setDiagnosisCodes((c) => c.filter((_, i) => i !== index));
  }

  function onFileChange(e) {
    const chosen = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...chosen]);
  }

  function removeLocalFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadSingle(file, token) {
    if (!token) throw new Error("Missing auth token");
    if (!appointment?._id) throw new Error("Missing appointment id");

    // debug
    console.debug(
      "[uploadSingle] appointmentId:",
      appointment._id,
      "tokenPresent:",
      !!token
    );

    const formData = new FormData();
    formData.append("file", file);

    const url = `${API_BASE}/api/records/appointments/${appointment._id}/attachments`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Upload failed: ${res.status} ${txt}`);
    }

    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Upload failed");
    return json.file;
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(null);

    // basic validation
    if (!diagnosisText && prescriptions.every((p) => !p.name)) {
      setError("Please enter a diagnosis or at least one prescription.");
      return;
    }

    setSaving(true);

    try {
      const token = resolveToken();
      if (!token) throw new Error("Missing auth token");
      if (!appointment?._id) throw new Error("Missing appointment id");

      // 1) upload attachments first (if any)
      let uploadedAttachments = [];
      if (files.length > 0) {
        setUploading(true);
        for (const f of files) {
          try {
            const uploaded = await uploadSingle(f, token);
            uploadedAttachments.push({
              url: uploaded.url,
              filename: uploaded.filename,
              type: uploaded.type,
            });
          } catch (uErr) {
            console.error("file upload error", uErr);
            throw uErr; // abort save if any upload fails
          }
        }
        setUploading(false);
      }

      // 2) call finish endpoint
      const payload = {
        diagnosis: {
          text: diagnosisText,
          codes: diagnosisCodes.filter(
            (c) =>
              (c.code || c.display) && (c.code?.trim() || c.display?.trim())
          ),
        },
        prescriptions: prescriptions
          .filter((p) => p.name && p.name.trim())
          .map((p) => ({ ...p })),
        doctorNotes,
        vitals: { bp, hr: hr ? Number(hr) : null },
        attachments: uploadedAttachments,
      };

      // debug
      console.debug(
        "[handleSave] sending payload for appointment:",
        appointment._id,
        "payload:",
        payload
      );

      const finishUrl = `${API_BASE}/api/records/appointments/${appointment._id}/finish`;

      const res = await fetch(finishUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Save failed: ${res.status} ${txt}`);
      }

      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Save failed");

      // success: call onSaved with updated appointment object
      if (onSaved) onSaved(json.appointment || json);
      onClose?.();
    } catch (err) {
      console.error("save error", err);
      setError(err.message || String(err));
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onClose?.()}
      />

      <form
        onSubmit={handleSave}
        className="relative z-10 w-full max-w-3xl bg-white rounded-2xl shadow-xl p-6 space-y-4 overflow-y-auto max-h-[90vh]"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Finalize Visit — {appointment?.slotDate || ""}{" "}
            {appointment?.slotTime || ""}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="text-sm px-3 py-1 rounded bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-sm px-3 py-1 rounded bg-indigo-600 text-white"
            >
              {saving ? "Saving..." : "Save & Close"}
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        {/* Diagnosis */}
        <div>
          <label className="block text-sm font-medium">Diagnosis</label>
          <textarea
            value={diagnosisText}
            onChange={(e) => setDiagnosisText(e.target.value)}
            className="mt-1 w-full border rounded p-2"
            rows={3}
          />
        </div>

        {/* Diagnosis codes (ICD) */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">
              Diagnosis Codes (optional)
            </label>
            <button
              type="button"
              onClick={addDiagnosisCode}
              className="text-xs text-indigo-600"
            >
              + Add code
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {diagnosisCodes.map((c, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  value={c.system}
                  onChange={(e) =>
                    updateDiagnosisCode(idx, "system", e.target.value)
                  }
                  placeholder="system"
                  className="border rounded p-1 w-28"
                />
                <input
                  value={c.code}
                  onChange={(e) =>
                    updateDiagnosisCode(idx, "code", e.target.value)
                  }
                  placeholder="code"
                  className="border rounded p-1 w-36"
                />
                <input
                  value={c.display}
                  onChange={(e) =>
                    updateDiagnosisCode(idx, "display", e.target.value)
                  }
                  placeholder="display"
                  className="border rounded p-1 flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeDiagnosisCode(idx)}
                  className="text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Prescriptions */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Prescriptions</label>
            <button
              type="button"
              onClick={addPrescription}
              className="text-xs text-indigo-600"
            >
              + Add prescription
            </button>
          </div>

          <div className="mt-2 space-y-3">
            {prescriptions.map((rx, idx) => (
              <div key={idx} className="border rounded p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={rx.name}
                    onChange={(e) =>
                      updatePrescription(idx, "name", e.target.value)
                    }
                    placeholder="Drug name"
                    className="border rounded p-1 flex-1"
                  />
                  <input
                    value={rx.form}
                    onChange={(e) =>
                      updatePrescription(idx, "form", e.target.value)
                    }
                    placeholder="form"
                    className="border rounded p-1 w-28"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    value={rx.dose}
                    onChange={(e) =>
                      updatePrescription(idx, "dose", e.target.value)
                    }
                    placeholder="dose"
                    className="border rounded p-1 w-36"
                  />
                  <input
                    value={rx.frequency}
                    onChange={(e) =>
                      updatePrescription(idx, "frequency", e.target.value)
                    }
                    placeholder="frequency"
                    className="border rounded p-1 w-36"
                  />
                  <input
                    value={rx.duration}
                    onChange={(e) =>
                      updatePrescription(idx, "duration", e.target.value)
                    }
                    placeholder="duration"
                    className="border rounded p-1 w-36"
                  />
                </div>
                <div>
                  <input
                    value={rx.instructions}
                    onChange={(e) =>
                      updatePrescription(idx, "instructions", e.target.value)
                    }
                    placeholder="instructions"
                    className="border rounded p-1 w-full"
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
          </div>
        </div>

        {/* Doctor notes & vitals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Doctor notes</label>
            <textarea
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              className="mt-1 w-full border rounded p-2"
              rows={5}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Vitals</label>
            <div className="mt-1 flex gap-2">
              <input
                value={bp}
                onChange={(e) => setBp(e.target.value)}
                placeholder="BP e.g. 120/80"
                className="border rounded p-1 w-36"
              />
              <input
                value={hr}
                onChange={(e) => setHr(e.target.value)}
                placeholder="HR"
                className="border rounded p-1 w-24"
              />
            </div>
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-sm font-medium">
            Attachments (images/PDF)
          </label>
          <input
            type="file"
            multiple
            onChange={onFileChange}
            className="mt-2"
          />

          <div className="mt-2 space-y-1">
            {files.map((f, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between border rounded p-2"
              >
                <div className="truncate">
                  {f.name} • {Math.round(f.size / 1024)} KB
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => removeLocalFile(idx)}
                    className="text-red-600 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="px-4 py-2 rounded bg-gray-100"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={saving || uploading}
            className="px-4 py-2 rounded bg-indigo-600 text-white"
          >
            {saving
              ? "Saving..."
              : uploading
              ? "Uploading..."
              : "Finalize Visit"}
          </button>
        </div>
      </form>
    </div>
  );
}
