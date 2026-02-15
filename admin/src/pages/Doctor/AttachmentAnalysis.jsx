// admin/src/pages/Doctor/AttachmentAnalysis.jsx
import React, { useEffect, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DoctorContext } from "../../context/DoctorContext";
import ImageAnnotatorModal from "../../components/ImageAnnotatorModal";

/**
 * AttachmentAnalysis
 * (unchanged logic except for adding "Open in Annotator" for Original/Overlay)
 */
const AttachmentAnalysis = () => {
  const { appointmentId, fileId } = useParams();
  const navigate = useNavigate();
  const { dToken, backendUrl } = useContext(DoctorContext);

  const [attachment, setAttachment] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [doctorNotes, setDoctorNotes] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [inMemoryImages, setInMemoryImages] = useState(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // NEW: annotator modal state
  const [annotatorOpen, setAnnotatorOpen] = useState(false);
  const [annotatorSrc, setAnnotatorSrc] = useState(null);
  const [annotatorFilename, setAnnotatorFilename] = useState("image");

  useEffect(() => {
    if (!appointmentId) return;
    (async () => {
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
          const att = (ap?.clinical?.attachments || []).find(
            (a) => String(a.fileId) === String(fileId) || a.fileId === fileId,
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
        { headers: { Authorization: `Bearer ${dToken}` } },
      );
    } catch (err) {
      console.error("save doctor notes:", err);
      alert("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  const parseReport = (reportRaw) => {
    if (!reportRaw) return null;
    if (typeof reportRaw === "object") return reportRaw;
    try {
      return JSON.parse(reportRaw);
    } catch (e) {
      return null;
    }
  };

  const generateSummaryFromReport = (reportObj) => {
    if (!reportObj) return { summary: "No report content", findings: {} };

    const lines = [];
    const findings = {};

    if (reportObj.generated_at)
      lines.push(`Generated: ${reportObj.generated_at}`);
    if (reportObj.mask_shape && Array.isArray(reportObj.mask_shape)) {
      const [h, w] = [reportObj.mask_shape[0], reportObj.mask_shape[1]];
      lines.push(`Mask size: ${w}×${h} px`);
      findings.mask_shape = reportObj.mask_shape;
    }
    if (typeof reportObj.num_labels !== "undefined")
      lines.push(`Classes detected: ${reportObj.num_labels}`);

    const analysis = reportObj.analysis || {};
    const labelKeys = Object.keys(analysis).sort(
      (a, b) => Number(a) - Number(b),
    );
    const labelSummaries = [];

    labelKeys.forEach((labelKey) => {
      const labelNum = labelKey;
      const info = analysis[labelKey];
      if (!info) return;
      const cov = Number(info.coverage_percent || 0);
      const regions = Number(info.num_regions || 0);
      const largestRegion =
        Array.isArray(info.regions) && info.regions.length
          ? info.regions.reduce(
              (max, r) => (r.pixel_count > (max.pixel_count || 0) ? r : max),
              {},
            )
          : null;
      const short = `Class ${labelNum}: ${cov.toFixed(2)}% coverage, ${regions} region${regions === 1 ? "" : "s"}${largestRegion ? `, largest ~${largestRegion.pixel_count} px` : ""}`;
      const flags = [];
      if (cov >= 5) flags.push("substantial coverage");
      if (regions >= 20) flags.push("many small regions");
      if (flags.length) findings[`class_${labelNum}_flags`] = flags;
      findings[`class_${labelNum}`] = {
        coverage_percent: cov,
        num_regions: regions,
        largest_region: largestRegion || null,
      };

      labelSummaries.push(
        short + (flags.length ? ` (${flags.join(", ")})` : ""),
      );
    });

    if (labelSummaries.length) {
      lines.push("Key class summaries:");
      lines.push(labelSummaries.join("; "));
    }

    if (reportObj.notes) {
      if (reportObj.notes.threshold)
        findings.threshold = reportObj.notes.threshold;
    }

    const suggestions = [];
    const anySubstantial = labelKeys.some((k) => {
      const c = Number(analysis[k]?.coverage_percent || 0);
      return c >= 5;
    });
    if (anySubstantial)
      suggestions.push(
        "Significant abnormal coverage in one or more classes — correlate with clinical exam.",
      );
    const manyRegions = labelKeys.some(
      (k) => Number(analysis[k]?.num_regions || 0) >= 20,
    );
    if (manyRegions)
      suggestions.push(
        "Multiple small lesions detected — consider close inspection of flagged areas.",
      );

    if (suggestions.length) {
      lines.push("Clinical note: " + suggestions.join(" "));
      findings.suggestions = suggestions;
    }

    const summaryText = lines.join("  •  ");
    return { summary: summaryText, findings };
  };

  const analyze = async () => {
    if (!attachment?.url) return alert("Attachment URL missing");
    setAnalyzing(true);
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/ai/analyze`,
        { fileUrl: attachment.url },
        { headers: { Authorization: `Bearer ${dToken}` } },
      );
      if (!data?.success) throw new Error("AI analyze failed");

      const aiResult = data.analysis || {};
      if (aiResult.images && aiResult.images.overlay) {
        setInMemoryImages({ overlay: aiResult.images.overlay });
      } else {
        setInMemoryImages(null);
      }

      const reportObj = parseReport(aiResult.report);
      const { summary, findings } = generateSummaryFromReport(reportObj);

      const aiToSave = {
        urls: aiResult.urls || attachment?.aiAnalysis?.urls || null,
        summary: summary,
        findings: findings,
      };
      if (reportObj) aiToSave.report = reportObj;

      await axios.patch(
        `${backendUrl}/api/records/appointments/${appointmentId}/attachments/${fileId}/ai`,
        { aiAnalysis: aiToSave },
        { headers: { Authorization: `Bearer ${dToken}` } },
      );

      setAiAnalysis(aiToSave);
      setAttachment((prev) => ({ ...(prev || {}), aiAnalysis: aiToSave }));
    } catch (err) {
      console.error("analyze error:", err);
      alert("Analysis failed (see console)");
    } finally {
      setAnalyzing(false);
    }
  };

  const getOverlaySrc = () => {
    if (inMemoryImages?.overlay) return inMemoryImages.overlay;
    const normalizeUrl = (u) => {
      if (!u) return null;
      if (
        u.startsWith("http://") ||
        u.startsWith("https://") ||
        u.startsWith("data:")
      )
        return u;
      if (u.startsWith("/")) {
        const base = backendUrl
          ? backendUrl.replace(/\/$/, "")
          : window.location.origin;
        return `${base}${u}`;
      }
      return u;
    };

    if (aiAnalysis?.urls?.overlay) return normalizeUrl(aiAnalysis.urls.overlay);
    if (attachment?.aiAnalysis?.urls?.overlay)
      return normalizeUrl(attachment.aiAnalysis.urls.overlay);
    return null;
  };

  // NEW: open annotator helpers
  const openAnnotator = (src, name = "image") => {
    if (!src) return alert("No image available to annotate");
    setAnnotatorFilename(name);
    setAnnotatorSrc(src);
    setAnnotatorOpen(true);
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
    <div className="p-6 flex-1 min-h-0 overflow-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start min-h-0">
        {/* LEFT: stacked images (Original on top, Overlay below) */}
        <div className="w-full space-y-4">
          <div className="bg-white border rounded p-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium mb-2">Original</div>
              {attachment.type?.startsWith?.("image") && (
                <div>
                  <button
                    onClick={() =>
                      openAnnotator(
                        attachment.url,
                        attachment.filename || "original",
                      )
                    }
                    className="text-xs px-2 py-1 border rounded bg-white"
                  >
                    Open in Annotator
                  </button>
                </div>
              )}
            </div>
            <div className="w-full flex items-center justify-center bg-gray-50">
              {attachment.type?.startsWith?.("image") ? (
                <img
                  src={attachment.url}
                  alt={attachment.filename}
                  className="max-h-[60vh] w-full object-contain"
                />
              ) : (
                <div className="p-4 text-sm text-gray-600">
                  Cannot preview this file type
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border rounded p-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium mb-2">Overlay</div>
              {getOverlaySrc() && (
                <div>
                  <button
                    onClick={() => openAnnotator(getOverlaySrc(), "overlay")}
                    className="text-xs px-2 py-1 border rounded bg-white"
                  >
                    Open in Annotator
                  </button>
                </div>
              )}
            </div>
            <div className="w-full flex items-center justify-center bg-gray-50">
              {getOverlaySrc() ? (
                <img
                  src={getOverlaySrc()}
                  alt="overlay"
                  className="max-h-[60vh] w-full object-contain"
                />
              ) : (
                <div className="p-4 text-sm text-gray-600">
                  No overlay available yet
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: controls + AI notes + Doctor notes */}
        <div className="space-y-4">
          <button
            onClick={analyze}
            disabled={analyzing}
            className="w-full px-4 py-3 rounded text-white bg-primary"
          >
            {analyzing ? "Analyzing..." : "Run AI Analysis"}
          </button>

          <div className="bg-white border rounded p-3">
            <p className="font-semibold">AI Notes</p>
            <div className="text-sm text-gray-700 mt-2 space-y-2">
              {aiAnalysis ? (
                <>
                  <div className="prose-sm">
                    <strong>Summary:</strong>
                    <div className="mt-1">
                      {aiAnalysis.summary || "No summary available"}
                    </div>
                  </div>

                  {aiAnalysis.findings && (
                    <div className="mt-2">
                      <strong>Key metrics:</strong>
                      <ul className="list-disc list-inside text-sm mt-1">
                        {Object.entries(aiAnalysis.findings)
                          .slice(0, 8)
                          .map(([k, v]) => (
                            <li key={k}>
                              <span className="font-medium">
                                {k.replace(/_/g, " ")}:
                              </span>{" "}
                              {typeof v === "object"
                                ? JSON.stringify(v)
                                : String(v)}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-2">
                    AI notes saved to the appointment (URLs + summary). Refresh
                    will keep these.
                  </div>
                </>
              ) : (
                <div>
                  No AI analysis saved yet. Run analysis to generate notes.
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border rounded p-3">
            <p className="font-semibold">Doctor Notes</p>
            <textarea
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              className="w-full border rounded p-2 mt-2"
              rows={6}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={saveDoctorNotes}
                disabled={saving}
                className="px-3 py-1 border rounded"
              >
                {saving ? "Saving..." : "Save notes"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Annotator modal */}
      {annotatorOpen && annotatorSrc && (
        <ImageAnnotatorModal
          src={annotatorSrc}
          filename={annotatorFilename}
          onClose={() => {
            setAnnotatorOpen(false);
            setAnnotatorSrc(null);
          }}
        />
      )}
    </div>
  );
};

export default AttachmentAnalysis;
