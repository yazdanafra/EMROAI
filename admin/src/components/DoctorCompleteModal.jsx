import React, { useEffect, useState, useRef } from "react";

export default function DoctorCompleteModal({
  appointment,
  onClose,
  onSaved,
  authToken,
}) {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

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
    appointment?.clinical?.diagnosis?.text || "",
  );
  const [diagnosisCodes, setDiagnosisCodes] = useState(
    appointment?.clinical?.diagnosis?.codes || [],
  );
  const [prescriptions, setPrescriptions] = useState(
    appointment?.clinical?.prescriptions || [createEmptyRx()],
  );
  const [doctorNotes, setDoctorNotes] = useState(
    appointment?.clinical?.doctorNotes || "",
  );
  const [bp, setBp] = useState(appointment?.clinical?.vitals?.bp || "");
  const [hr, setHr] = useState(appointment?.clinical?.vitals?.hr || "");
  // files will be array of { file: File, preview: objectUrl }
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // hidden file input ref
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!prescriptions || prescriptions.length === 0)
      setPrescriptions([createEmptyRx()]);
    // cleanup previews on unmount
    return () => {
      files.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      p.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
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
      c.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    );
  }

  function removeDiagnosisCode(index) {
    setDiagnosisCodes((c) => c.filter((_, i) => i !== index));
  }

  // When files are selected via input
  function onFileChange(e) {
    const chosen = Array.from(e.target.files || []);
    if (!chosen.length) return;
    const mapped = chosen.map((f) => ({
      file: f,
      preview:
        f.type && f.type.startsWith("image") ? URL.createObjectURL(f) : null,
    }));
    setFiles((prev) => [...prev, ...mapped]);
    // reset input so same file can be reselected if needed
    e.target.value = "";
  }

  // allow triggering hidden input from styled button
  function triggerFileSelect() {
    fileInputRef.current?.click();
  }

  function removeLocalFile(idx) {
    setFiles((prev) => {
      const copy = [...prev];
      const removed = copy.splice(idx, 1)[0];
      if (removed && removed.preview) URL.revokeObjectURL(removed.preview);
      return copy;
    });
  }

  async function uploadSingle(file, token) {
    if (!token) throw new Error("Missing auth token");
    if (!appointment?._id) throw new Error("Missing appointment id");

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
      const txt = await res.text().catch(() => "");
      throw new Error(`Upload failed: ${res.status} ${txt}`);
    }

    const json = await res.json().catch(() => null);
    if (!json || !json.success) {
      throw new Error((json && json.message) || "Upload returned no success");
    }

    return json.file || json;
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(null);

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
        for (const item of files) {
          try {
            const uploaded = await uploadSingle(item.file, token);

            const fileId =
              uploaded.fileId ||
              uploaded._id ||
              uploaded.id ||
              uploaded.public_id ||
              uploaded.fileId;

            uploadedAttachments.push({
              url:
                uploaded.url ||
                uploaded.streamUrl ||
                uploaded.path ||
                uploaded.file ||
                "",
              filename:
                uploaded.filename ||
                uploaded.original_filename ||
                uploaded.name ||
                item.file.name,
              type: uploaded.type || uploaded.mimetype || item.file.type || "",
              fileId,
              uploadedAt: uploaded.uploadedAt || new Date().toISOString(),
            });
          } catch (uErr) {
            console.error("file upload error", uErr);
            throw uErr; // abort save if any upload fails
          }
        }
        setUploading(false);
      }

      // 2) call finish endpoint with attachments that include fileId
      const payload = {
        diagnosis: {
          text: diagnosisText,
          codes: (diagnosisCodes || []).filter(
            (c) =>
              (c.code || c.display) &&
              (String(c.code || "").trim() || String(c.display || "").trim()),
          ),
        },
        prescriptions: (prescriptions || [])
          .filter((p) => p.name && p.name.trim())
          .map((p) => ({ ...p })),
        doctorNotes,
        vitals: { bp, hr: hr ? Number(hr) : null },
        attachments: uploadedAttachments, // these entries include fileId now
      };

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
        const txt = await res.text().catch(() => "");
        throw new Error(`Save failed: ${res.status} ${txt}`);
      }

      const json = await res.json().catch(() => null);
      if (!json || !json.success)
        throw new Error((json && json.message) || "Save failed");

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

  // helper to show small icon for file type
  const FileThumb = ({ item }) => {
    const isImage = item.preview;
    if (isImage) {
      return (
        <img
          src={item.preview}
          alt={item.file.name}
          className="w-14 h-14 object-cover rounded"
        />
      );
    }
    // simple inline SVG for document icon
    return (
      <div className="w-14 h-14 flex items-center justify-center rounded bg-gray-100 border">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 7h6l4 4v6a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z"
          />
        </svg>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onClose?.()}
        aria-hidden
      />

      <form
        onSubmit={handleSave}
        className="relative z-10 w-full max-w-4xl bg-white rounded-2xl shadow-xl p-6 space-y-6 overflow-y-auto max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">
              Finalize Visit
            </h3>
            <div className="text-sm text-gray-500">
              {appointment?.slotDate || ""} {appointment?.slotTime || ""}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="text-sm px-3 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="text-sm px-3 py-2 rounded-md bg-primary text-white shadow-sm hover:opacity-95 disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : uploading
                  ? "Uploading..."
                  : "Save & Close"}
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        {/* Main grid: left = text entries, right = notes/vitals (responsive) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            {/* Diagnosis */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Diagnosis
              </label>
              <textarea
                value={diagnosisText}
                onChange={(e) => setDiagnosisText(e.target.value)}
                className="mt-2 w-full border rounded-md p-3 resize-none focus:ring-2 focus:ring-primary/30"
                rows={4}
                placeholder="Enter diagnosis summary..."
              />
            </div>

            {/* Diagnosis codes */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  Diagnosis Codes (optional)
                </label>
                <button
                  type="button"
                  onClick={addDiagnosisCode}
                  className="text-xs text-primary"
                >
                  + Add code
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {diagnosisCodes.map((c, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      value={c.system}
                      onChange={(e) =>
                        updateDiagnosisCode(idx, "system", e.target.value)
                      }
                      placeholder="system"
                      className="border rounded p-2 w-28"
                    />
                    <input
                      value={c.code}
                      onChange={(e) =>
                        updateDiagnosisCode(idx, "code", e.target.value)
                      }
                      placeholder="code"
                      className="border rounded p-2 w-36"
                    />
                    <input
                      value={c.display}
                      onChange={(e) =>
                        updateDiagnosisCode(idx, "display", e.target.value)
                      }
                      placeholder="display"
                      className="border rounded p-2 flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeDiagnosisCode(idx)}
                      className="text-sm text-red-600"
                      aria-label="Remove code"
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
                <label className="block text-sm font-medium text-gray-700">
                  Prescriptions
                </label>
                <button
                  type="button"
                  onClick={addPrescription}
                  className="text-xs text-primary"
                >
                  + Add prescription
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {prescriptions.map((rx, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-3 bg-gray-50 space-y-2"
                  >
                    <div className="flex gap-2">
                      <input
                        value={rx.name}
                        onChange={(e) =>
                          updatePrescription(idx, "name", e.target.value)
                        }
                        placeholder="Drug name"
                        className="border rounded p-2 flex-1"
                      />
                      <input
                        value={rx.form}
                        onChange={(e) =>
                          updatePrescription(idx, "form", e.target.value)
                        }
                        placeholder="form"
                        className="border rounded p-2 w-28"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={rx.dose}
                        onChange={(e) =>
                          updatePrescription(idx, "dose", e.target.value)
                        }
                        placeholder="dose"
                        className="border rounded p-2 w-36"
                      />
                      <input
                        value={rx.frequency}
                        onChange={(e) =>
                          updatePrescription(idx, "frequency", e.target.value)
                        }
                        placeholder="frequency"
                        className="border rounded p-2 w-36"
                      />
                      <input
                        value={rx.duration}
                        onChange={(e) =>
                          updatePrescription(idx, "duration", e.target.value)
                        }
                        placeholder="duration"
                        className="border rounded p-2 w-36"
                      />
                    </div>
                    <div>
                      <input
                        value={rx.instructions}
                        onChange={(e) =>
                          updatePrescription(
                            idx,
                            "instructions",
                            e.target.value,
                          )
                        }
                        placeholder="instructions"
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
              </div>
            </div>
          </div>

          {/* Right column: notes, vitals, attachments */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Doctor notes
              </label>
              <textarea
                value={doctorNotes}
                onChange={(e) => setDoctorNotes(e.target.value)}
                className="mt-2 w-full border rounded-md p-3 resize-none focus:ring-2 focus:ring-primary/30"
                rows={6}
                placeholder="Add brief notes for the patient..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Vitals
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  value={bp}
                  onChange={(e) => setBp(e.target.value)}
                  placeholder="BP e.g. 120/80"
                  className="border rounded p-2 w-36"
                />
                <input
                  value={hr}
                  onChange={(e) => setHr(e.target.value)}
                  placeholder="HR"
                  className="border rounded p-2 w-24"
                />
              </div>
            </div>

            {/* Attachments area */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Attachments
              </label>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={triggerFileSelect}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white border border-gray-200 shadow-sm hover:bg-gray-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    <span className="text-sm text-gray-700">Choose files</span>
                  </button>

                  <div className="text-sm text-gray-500">
                    PNG, JPG, PDF — max typical file size 10MB
                  </div>
                </div>

                {/* hidden input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={onFileChange}
                  className="hidden"
                />

                {/* selected files list */}
                <div className="grid grid-cols-1 gap-2">
                  {files.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border rounded-md p-2 bg-white"
                    >
                      <div className="flex items-center gap-3">
                        <FileThumb item={f} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {f.file.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {(f.file.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeLocalFile(idx)}
                          className="text-sm text-red-600 px-2 py-1 rounded-md"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="px-4 py-2 rounded-md bg-gray-100"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={saving || uploading}
            className="px-4 py-2 rounded-md bg-primary text-white shadow"
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
