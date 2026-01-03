// admin/src/pages/Doctor/AttachmentAnalysis.jsx
import React, { useEffect, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DoctorContext } from "../../context/DoctorContext";

const AttachmentAnalysis = () => {
  const { appointmentId, fileId } = useParams();
  const navigate = useNavigate();
  const { dToken, backendUrl } = useContext(DoctorContext);

  const [attachment, setAttachment] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [doctorNotes, setDoctorNotes] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!appointmentId) return;
    (async () => {
      try {
        const { data } = await axios.get(
          `${backendUrl}/api/records/appointments/${appointmentId}`,
          {
            headers: { Authorization: `Bearer ${dToken}` },
          }
        );
        if (data.success) {
          const ap = data.appointment || data;
          setAppointment(ap);
          const att = (ap?.clinical?.attachments || []).find(
            (a) => String(a.fileId) === String(fileId) || a.fileId === fileId
          );
          setAttachment(att || null);
          setDoctorNotes(att?.doctorNotes || "");
          setAiAnalysis(att?.aiAnalysis || null);
        }
      } catch (err) {
        console.error("fetch appointment:", err);
      }
    })();
  }, [appointmentId, fileId, backendUrl, dToken]);

  const saveDoctorNotes = async () => {
    setSaving(true);
    try {
      await axios.patch(
        `${backendUrl}/api/records/appointments/${appointmentId}/attachments/${fileId}/doctor-notes`,
        { doctorNotes },
        { headers: { Authorization: `Bearer ${dToken}` } }
      );
      // optimistic UI: no extra fetch necessary
    } catch (err) {
      console.error("save doctor notes:", err);
      alert("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  const analyze = async () => {
    if (!attachment?.url) return alert("Attachment URL missing");
    setAnalyzing(true);
    try {
      // 1) call AI proxy
      const { data } = await axios.post(
        `${backendUrl}/api/ai/analyze`,
        { fileUrl: attachment.url },
        { headers: { Authorization: `Bearer ${dToken}` } }
      );
      if (!data?.success) throw new Error("AI analyze failed");

      const aiResult = data.analysis;

      // 2) save AI result to DB
      await axios.patch(
        `${backendUrl}/api/records/appointments/${appointmentId}/attachments/${fileId}/ai`,
        { aiAnalysis: aiResult },
        { headers: { Authorization: `Bearer ${dToken}` } }
      );

      setAiAnalysis(aiResult);
    } catch (err) {
      console.error("analyze error:", err);
      alert("Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  if (!attachment) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 px-3 py-1 border rounded"
        >
          Back
        </button>
        <div>No attachment found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 h-screen overflow-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT: image container */}
        <div className="w-full h-[70vh] flex items-center justify-center bg-white border rounded overflow-hidden">
          {/* The container is responsive and will shrink the image into it */}
          {attachment.type?.startsWith?.("image") ? (
            <img
              src={attachment.url}
              alt={attachment.filename}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="p-4 text-sm text-gray-600">
              Cannot preview this file type
            </div>
          )}
        </div>

        {/* RIGHT: controls */}
        <div className="space-y-4">
          <button
            onClick={analyze}
            disabled={analyzing}
            className="w-full px-4 py-3 rounded text-white bg-primary"
          >
            {analyzing ? "Analyzing..." : "Analyze image"}
          </button>

          <div className="bg-white border rounded p-4">
            <h4 className="font-medium mb-2">Doctor Notes</h4>
            <textarea
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              rows={8}
              className="w-full border rounded p-2"
              placeholder="No notes yet"
            />
            <div className="flex gap-2 justify-end mt-3">
              <button
                onClick={saveDoctorNotes}
                disabled={saving}
                className="px-3 py-1 rounded border"
              >
                {saving ? "Saving..." : "Save notes"}
              </button>
            </div>
          </div>

          <div className="bg-white border rounded p-4">
            <h4 className="font-medium mb-2">AI Analysis</h4>
            {aiAnalysis && Object.keys(aiAnalysis).length ? (
              <pre className="text-sm whitespace-pre-wrap">
                {JSON.stringify(aiAnalysis, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">No AI notes yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttachmentAnalysis;
