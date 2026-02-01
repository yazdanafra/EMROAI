// admin/src/pages/Doctor/AttachmentAnalysis.jsx
import React, { useEffect, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DoctorContext } from "../../context/DoctorContext";

/**
 * AttachmentAnalysis
 * - Shows original image (top) and overlay image (below) with titles
 * - Runs AI analysis and saves lightweight aiAnalysis to DB:
 *     { urls: { overlay, colored_mask, label_mask }, summary: "...", findings: {...} }
 * - Keeps base64 overlay in-memory for immediate display, but does NOT save base64 to DB
 * - Shows concise AI Notes generated from report.json
 */
const AttachmentAnalysis = () => {
  const { appointmentId, fileId } = useParams();
  const navigate = useNavigate();
  const { dToken, backendUrl } = useContext(DoctorContext);

  const [attachment, setAttachment] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [doctorNotes, setDoctorNotes] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState(null); // holds either returned analysis (with images) or saved DB analysis
  const [inMemoryImages, setInMemoryImages] = useState(null); // { overlay: base64 } for immediate display
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
          // If DB already has aiAnalysis (urls + summary), load it into state:
          setAiAnalysis(att?.aiAnalysis || null);
        }
      } catch (err) {
        console.error("fetch appointment:", err);
      }
    })();
  }, [appointmentId, fileId, backendUrl, dToken]);

  // Save doctor notes (unchanged route)
  const saveDoctorNotes = async () => {
    setSaving(true);
    try {
      await axios.patch(
        `${backendUrl}/api/records/appointments/${appointmentId}/attachments/${fileId}/doctor-notes`,
        { doctorNotes },
        { headers: { Authorization: `Bearer ${dToken}` } },
      );
      // optimistic UI: success assumed
    } catch (err) {
      console.error("save doctor notes:", err);
      alert("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  // Helper: parse report JSON robustly (report may be object or JSON string)
  const parseReport = (reportRaw) => {
    if (!reportRaw) return null;
    if (typeof reportRaw === "object") return reportRaw;
    try {
      return JSON.parse(reportRaw);
    } catch (e) {
      // if it's not JSON, return null
      return null;
    }
  };

  // Create concise, practical summary + findings based on the report structure you provided
  const generateSummaryFromReport = (reportObj) => {
    if (!reportObj) return { summary: "No report content", findings: {} };

    const lines = [];
    const findings = {};

    // top metadata
    if (reportObj.generated_at)
      lines.push(`Generated: ${reportObj.generated_at}`);
    if (reportObj.mask_shape && Array.isArray(reportObj.mask_shape)) {
      const [h, w] = [reportObj.mask_shape[0], reportObj.mask_shape[1]];
      lines.push(`Mask size: ${w}×${h} px`);
      findings.mask_shape = reportObj.mask_shape;
    }
    if (typeof reportObj.num_labels !== "undefined")
      lines.push(`Classes detected: ${reportObj.num_labels}`);

    // analyze per-label data (skip label "0" which tends to be background)
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
      // find largest region
      const largestRegion =
        Array.isArray(info.regions) && info.regions.length
          ? info.regions.reduce(
              (max, r) => (r.pixel_count > (max.pixel_count || 0) ? r : max),
              {},
            )
          : null;
      // build short text
      const short = `Class ${labelNum}: ${cov.toFixed(2)}% coverage, ${regions} region${regions === 1 ? "" : "s"}${largestRegion ? `, largest ~${largestRegion.pixel_count} px` : ""}`;
      // add flags for clinically important thresholds (simple heuristics)
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
      // keep it compact: join with "; "
      lines.push(labelSummaries.join("; "));
    }

    // if there are specific notes object, include threshold or meta info
    if (reportObj.notes) {
      if (reportObj.notes.threshold)
        findings.threshold = reportObj.notes.threshold;
    }

    // final suggested clinical comment (very short)
    const suggestions = [];
    // if any class flagged with substantial coverage add recommendation
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

  // analyze: call AI and save lightweight result to DB (urls + summary + findings)
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

      const aiResult = data.analysis || {}; // the full analysis returned by your AI proxy
      // keep immediate overlay base64 (if present) in-memory for instant display:
      if (aiResult.images && aiResult.images.overlay) {
        setInMemoryImages({ overlay: aiResult.images.overlay });
      } else {
        setInMemoryImages(null);
      }

      // parse report.json from aiResult.report (object or JSON string)
      const reportObj = parseReport(aiResult.report);
      const { summary, findings } = generateSummaryFromReport(reportObj);

      // Build the small payload to persist to DB (do NOT include base64 images)
      const aiToSave = {
        urls: aiResult.urls || attachment?.aiAnalysis?.urls || null,
        summary: summary,
        findings: findings,
        // keep the raw report if it's small (optional). If it's huge, backend will reject — so only keep key summary.
        // Here we save the parsed report object if it's present and relatively small-ish (you can change later).
      };
      if (reportObj) aiToSave.report = reportObj;

      // patch to server endpoint that stores aiAnalysis for the attachment
      await axios.patch(
        `${backendUrl}/api/records/appointments/${appointmentId}/attachments/${fileId}/ai`,
        { aiAnalysis: aiToSave },
        { headers: { Authorization: `Bearer ${dToken}` } },
      );

      // update UI state: combine saved aiToSave OR prefer full aiResult for immediate UI (but remove base64 before saving to state)
      // We'll keep a union where inMemoryImages holds the overlay base64 (for display) and aiAnalysis holds the persistent (saved) object.
      setAiAnalysis(aiToSave);
      // Also refresh local attachment to include saved aiAnalysis so persistent view on reload works:
      setAttachment((prev) => ({ ...(prev || {}), aiAnalysis: aiToSave }));
    } catch (err) {
      console.error("analyze error:", err);
      alert("Analysis failed (see console)");
    } finally {
      setAnalyzing(false);
    }
  };

  // Helper to decide which overlay src to display:
  // priority: inMemoryImages.overlay (base64) -> aiAnalysis.urls.overlay (saved url) -> attachment.aiAnalysis.urls.overlay
  const getOverlaySrc = () => {
    // in-memory base64 (highest priority)
    if (inMemoryImages?.overlay) return inMemoryImages.overlay;

    // helper to turn relative backend path (e.g. "/ai_results/<id>/overlay.png")
    // into an absolute URL using the configured backendUrl.
    const normalizeUrl = (u) => {
      if (!u) return null;
      // already absolute or data URI?
      if (
        u.startsWith("http://") ||
        u.startsWith("https://") ||
        u.startsWith("data:")
      )
        return u;
      // relative path (starts with "/")
      if (u.startsWith("/")) {
        const base = backendUrl
          ? backendUrl.replace(/\/$/, "")
          : window.location.origin;
        return `${base}${u}`;
      }
      // fallback: return as-is
      return u;
    };

    if (aiAnalysis?.urls?.overlay) return normalizeUrl(aiAnalysis.urls.overlay);
    if (attachment?.aiAnalysis?.urls?.overlay)
      return normalizeUrl(attachment.aiAnalysis.urls.overlay);
    return null;
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

  // Layout: on small screens stack, on lg screens place images and controls side-by-side.
  // Use flex-1 + min-h-0 to behave well inside parent flex layout (prevents sidebar shrink).
  return (
    <div className="p-6 flex-1 min-h-0 overflow-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start min-h-0">
        {/* LEFT: stacked images (Original on top, Overlay below) */}
        <div className="w-full space-y-4">
          <div className="bg-white border rounded p-2">
            <div className="text-sm font-medium mb-2">Original</div>
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
            <div className="text-sm font-medium mb-2">Overlay</div>
            <div className="w-full flex items-center justify-center bg-gray-50">
              {getOverlaySrc() ? (
                // overlay may be a base64 data URL or a static URL
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
                  {/* human-readable summary */}
                  <div className="prose-sm">
                    <strong>Summary:</strong>
                    <div className="mt-1">
                      {aiAnalysis.summary || "No summary available"}
                    </div>
                  </div>

                  {/* structured findings short-list */}
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
    </div>
  );
};

export default AttachmentAnalysis;
