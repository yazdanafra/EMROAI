import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom"; // keep Link import
import axios from "axios";
import { toast } from "react-toastify";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";
import { assets } from "../../assets/assets";

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

  // upload state
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // renaming state (key = fileId or _id or url)
  const [renamingAttachment, setRenamingAttachment] = useState(null);

  // modal state for rename
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [modalAttachment, setModalAttachment] = useState(null);
  const [modalFilename, setModalFilename] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

  useEffect(() => {
    if (!appointmentId) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(
          `${backendUrl}/api/records/appointments/${appointmentId}`,
          {
            headers: { Authorization: `Bearer ${dToken}` },
          },
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

  // open file picker (called by + tile)
  const openFilePicker = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  // handle selected file(s)
  const onFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const f of files) {
      await uploadFile(f);
    }
    e.target.value = "";
  };

  // upload helper
  const uploadFile = async (file) => {
    if (!appointmentId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await axios.post(
        `${backendUrl}/api/records/appointments/${appointmentId}/attachments`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${dToken}`,
          },
        },
      );

      if (resp?.data?.success) {
        const fileObj =
          resp.data.file ||
          resp.data.savedFile ||
          resp.data.result ||
          resp.data.uploaded ||
          resp.data;

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
          fileId: fileObj.fileId || fileObj._id || fileObj.id,
        };

        setAttachments((prev) => [...prev, normalized]);

        setAppointment((prev) => {
          if (!prev) return prev;
          const clinical = { ...(prev.clinical || {}) };
          clinical.attachments = [...(clinical.attachments || []), normalized];
          return { ...prev, clinical };
        });

        toast.success("Attachment uploaded");
      } else {
        const msg = resp?.data?.message || "Upload failed";
        throw new Error(msg);
      }
    } catch (err) {
      console.error("attachment upload error:", err);
      const msg = err?.response?.data?.message || err.message || String(err);
      toast.error("Upload failed: " + msg);
    } finally {
      setUploading(false);
    }
  };

  // -------------------------
  // Helper: auth headers (doctor token)
  // -------------------------
  const getAuthHeaders = () => {
    const token =
      dToken ||
      localStorage.getItem("dToken") ||
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      "";
    return { Authorization: `Bearer ${token}` };
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
    setRenamingAttachment(null);
    // use renamingAttachment state slot for spinner for simplicity (reusing)
    setRenamingAttachment(`deleting-${deletingKey}`);

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
          setAttachments(data.appointment.clinical?.attachments || []);
        } else {
          const matches = (a) =>
            (a.fileId && fileId && String(a.fileId) === String(fileId)) ||
            (a._id && fileId && String(a._id) === String(fileId)) ||
            (a.url && a.url === att.url);
          setAttachments((prev) => (prev || []).filter((a) => !matches(a)));
          setAppointment((prev) => {
            if (!prev) return prev;
            const copy = { ...prev };
            copy.clinical = copy.clinical || {};
            copy.clinical.attachments = (
              copy.clinical.attachments || []
            ).filter((a) => !matches(a));
            return copy;
          });
        }
        toast.success("Attachment deleted");
      } else {
        throw new Error(data?.message || "Delete failed");
      }
    } catch (err) {
      console.error("deleteAttachment error:", err);
      const msg =
        err?.response?.data?.message || err.message || "Failed to delete";
      toast.error(msg);
    } finally {
      setRenamingAttachment(null);
    }
  };

  // ---------- Rename modal helpers ----------
  const openRenameModal = (att) => {
    setModalAttachment(att);
    setModalFilename(att.filename || "");
    setShowRenameModal(true);
  };

  const closeRenameModal = () => {
    setShowRenameModal(false);
    setModalAttachment(null);
    setModalFilename("");
    setModalSaving(false);
  };

  const saveRenameFromModal = async () => {
    if (!modalAttachment) return;
    const fileId =
      modalAttachment.fileId ||
      modalAttachment._id ||
      modalAttachment.id ||
      null;
    if (!fileId) {
      toast.error("Cannot rename this attachment (no fileId available).");
      return;
    }
    if (!modalFilename || !String(modalFilename).trim()) {
      toast.error("Filename cannot be empty.");
      return;
    }

    const key = String(fileId);
    setModalSaving(true);
    setRenamingAttachment(key);

    try {
      const url = `${backendUrl}/api/records/appointments/${appointment._id}/attachments/${encodeURIComponent(
        String(fileId),
      )}/rename`;

      const { data } = await axios.patch(
        url,
        { filename: String(modalFilename).trim() },
        { headers: getAuthHeaders() },
      );

      if (data?.success) {
        if (data.appointment) {
          setAppointment(data.appointment);
          setAttachments(data.appointment.clinical?.attachments || []);
        } else {
          // fallback local update
          setAttachments((prev) =>
            (prev || []).map((a) =>
              (a.fileId && String(a.fileId) === String(fileId)) ||
              String(a._id) === String(fileId)
                ? { ...a, filename: String(modalFilename).trim() }
                : a,
            ),
          );
          setAppointment((prev) => {
            if (!prev) return prev;
            const clinical = { ...(prev.clinical || {}) };
            clinical.attachments = (clinical.attachments || []).map((a) =>
              (a.fileId && String(a.fileId) === String(fileId)) ||
              String(a._id) === String(fileId)
                ? { ...a, filename: String(modalFilename).trim() }
                : a,
            );
            return { ...prev, clinical };
          });
        }
        toast.success("Attachment renamed");
        closeRenameModal();
      } else {
        throw new Error(data?.message || "Rename failed");
      }
    } catch (err) {
      console.error("renameAttachment error:", err);
      const msg =
        err?.response?.data?.message || err.message || "Rename failed";
      toast.error(msg);
    } finally {
      setModalSaving(false);
      setRenamingAttachment(null);
    }
  };

  // legacy direct rename helper (not used visually, kept for compatibility)
  const renameAttachmentLegacy = async (att) => {
    openRenameModal(att);
  };

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
            <div className="mt-4 flex justify-center">
              <button
                onClick={openFilePicker}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 border rounded text-sm bg-primary text-white"
              >
                {uploading ? "Uploading..." : "Add attachment"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredAttachments.map((att, i) => {
              const isImage =
                att.type && att.type.startsWith && att.type.startsWith("image");
              const fileId = att.fileId || att._id || att.id || null;
              const apptId = appointment?._id || appointmentId;
              const deletingKey = fileId || att.url;
              const key = fileId || att.url || `att-${i}`;
              const renKey = fileId || att.url || `att-${i}`;

              return (
                <div
                  key={key}
                  className="border rounded overflow-hidden bg-white flex flex-col"
                >
                  <div className="h-48 flex items-center justify-center bg-gray-50">
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

                  <div className="p-3">
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

                    {/* Action buttons: stacked full width like details page */}
                    <div className="flex flex-col gap-2">
                      {fileId ? (
                        <Link
                          to={`/doctor/attachment/${apptId}/${fileId}`}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameModal(att);
                        }}
                        disabled={renamingAttachment === renKey || modalSaving}
                        className="w-full text-center px-3 py-2 border rounded text-sm hover:bg-gray-50"
                      >
                        {renamingAttachment === renKey ||
                        (modalAttachment && modalAttachment === att)
                          ? "Renaming..."
                          : "Rename"}
                      </button>

                      <button
                        onClick={() => deleteAttachment(att)}
                        disabled={
                          renamingAttachment === `deleting-${deletingKey}`
                        }
                        className="w-full text-center px-3 py-2 border rounded text-sm text-red-600 hover:bg-red-50"
                      >
                        {renamingAttachment === `deleting-${deletingKey}`
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* plus tile at the end */}
            <div
              className="flex flex-col items-center justify-center border rounded p-4 cursor-pointer hover:shadow"
              onClick={openFilePicker}
              role="button"
              aria-label="Add attachment"
            >
              <img src={assets.plus_icon100} alt="Add" className="w-16 h-16" />
              <div className="mt-2 text-sm font-medium text-gray-700">Add</div>
              <div className="text-xs text-gray-500">
                {uploading ? "Uploading..." : "Click to add file"}
              </div>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          multiple
          onChange={onFilesSelected}
          className="hidden"
        />
      </div>

      {/* Rename modal */}
      {showRenameModal && modalAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black opacity-30"
            onClick={closeRenameModal}
          />
          <div className="relative bg-white rounded shadow-lg w-full max-w-md p-4 z-10">
            <h3 className="text-lg font-medium mb-2">Rename attachment</h3>
            <div className="text-sm text-gray-600 mb-3">
              {modalAttachment.filename || modalAttachment.url}
            </div>
            <input
              value={modalFilename}
              onChange={(e) => setModalFilename(e.target.value)}
              className="w-full p-2 border rounded mb-3"
              placeholder="New filename (include extension)"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={closeRenameModal}
                className="px-3 py-1 border rounded bg-white hover:bg-gray-50"
                disabled={modalSaving}
              >
                Cancel
              </button>
              <button
                onClick={saveRenameFromModal}
                className="px-3 py-1 border rounded bg-primary text-white"
                disabled={modalSaving}
              >
                {modalSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentAttachments;
