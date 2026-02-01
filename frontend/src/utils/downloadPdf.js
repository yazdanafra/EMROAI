// frontend/src/utils/downloadPdf.js
import axios from "axios";

/**
 * Download appointment PDF from backend and trigger save.
 * backendUrl: string, token: string, appointmentId: string, mode: 'ticket'|'full'
 */
export async function downloadAppointmentPdf(
  backendUrl,
  token,
  appointmentId,
  mode = "full",
) {
  const url = `${backendUrl}/api/records/appointments/${appointmentId}/pdf?mode=${encodeURIComponent(mode)}`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "blob",
  });
  const contentType = resp.headers["content-type"] || "application/pdf";
  const blobUrl = window.URL.createObjectURL(
    new Blob([resp.data], { type: contentType }),
  );
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `appointment_${appointmentId}_${mode}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}
