// admin/src/pages/Doctor/AppointmentAttachments.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
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

  // open file picker (called by + tile)
  const openFilePicker = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  // handle selected file(s)
  const onFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // upload one-by-one (you can change to parallel if desired)
    for (const f of files) {
      await uploadFile(f);
    }
    // clear input to allow selecting same file again later
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
            // let browser set Content-Type (multipart/form-data + boundary)
          },
        }
      );

      if (resp?.data?.success) {
        // backend expected to return the saved file object in resp.data.file
        const fileObj =
          resp.data.file ||
          resp.data.savedFile ||
          resp.data.result ||
          resp.data.uploaded ||
          resp.data; // fallback

        // normalize returned file object into attachment shape used by UI
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
        };

        // append to UI list
        setAttachments((prev) => [...prev, normalized]);

        // if appointment state exists, update it too so header count updates
        setAppointment((prev) => {
          if (!prev) return prev;
          const clinical = { ...(prev.clinical || {}) };
          clinical.attachments = [...(clinical.attachments || []), normalized];
          return { ...prev, clinical };
        });
      } else {
        const msg = resp?.data?.message || "Upload failed";
        throw new Error(msg);
      }
    } catch (err) {
      console.error("attachment upload error:", err);
      const msg = err?.response?.data?.message || err.message || String(err);
      alert("Upload failed: " + msg);
    } finally {
      setUploading(false);
    }
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
            {/* still show + tile so doctor can add new */}
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

        {/* hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          multiple
          onChange={onFilesSelected}
          className="hidden"
        />
      </div>
    </div>
  );
};

export default AppointmentAttachments;
