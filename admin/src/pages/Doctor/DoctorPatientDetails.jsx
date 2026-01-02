// admin/src/pages/Doctor/DoctorPatientDetails.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";
import { assets } from "../../assets/assets";

const PAGE_SIZE = 10; // show 10 appointments per page

const DoctorPatientDetails = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { dToken, backendUrl } = useContext(DoctorContext);
  const { slotDateFormat } = useContext(AppContext);

  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [patientName, setPatientName] = useState("");

  // search for slots only (slotDate or slotTime)
  const [searchTerm, setSearchTerm] = useState("");

  // pagination
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(
          `${backendUrl}/api/doctor/patients/${userId}/appointments`,
          { headers: { dToken } }
        );
        if (data.success) {
          setAppointments(data.appointments || []);
          if (data.appointments && data.appointments.length > 0) {
            setPatientName(data.appointments[0].userData?.name || "");
          }
        } else {
          setAppointments([]);
        }
      } catch (err) {
        console.error("fetch patient appointments error:", err);
        setAppointments([]);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [userId, dToken, backendUrl]);

  // compute whether patient has any attachments at all
  const totalAttachments = appointments.reduce((acc, a) => {
    const count = (a?.clinical?.attachments || []).length;
    return acc + count;
  }, 0);

  // filtered appointments (search only slotDate and slotTime)
  const filteredAppointments = useMemo(() => {
    const q = (searchTerm || "").trim().toLowerCase();
    if (!q) return appointments;

    return appointments.filter((a) => {
      const slotDateStr = a.slotDate
        ? String(slotDateFormat(a.slotDate)).toLowerCase()
        : "";
      const slotTimeStr = String(a.slotTime || "").toLowerCase();
      if (slotDateStr.includes(q)) return true;
      if (slotTimeStr.includes(q)) return true;
      return false;
    });
  }, [appointments, searchTerm, slotDateFormat]);

  // reset to first page when filtered list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, appointments.length]);

  // pagination calculations
  const totalAppointments = filteredAppointments.length;
  const totalPages = Math.max(1, Math.ceil(totalAppointments / PAGE_SIZE));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalAppointments);
  const visibleAppointments = filteredAppointments.slice(startIndex, endIndex);

  return (
    <div className="m-5 max-w-7xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-700">
            Patient: {patientName || userId}
          </h2>
          <p className="text-sm text-gray-500">
            Appointments with you ({appointments.length})
          </p>
        </div>
        <div>
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1 border rounded text-sm"
          >
            Back
          </button>
        </div>
      </div>

      {/* Responsive: attachments panel above appointments on small screens */}
      <div className="flex flex-col-reverse sm:flex-row gap-6">
        {/* Left column: appointments (grow) */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <div />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search slots by date or time..."
                className="px-3 py-2 border rounded text-sm w-full sm:w-auto"
              />
              <button
                onClick={() => {
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border rounded text-sm"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="bg-white border rounded">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 p-4 border-b text-sm text-gray-600">
              <div>Slot Date</div>
              <div>Slot Time</div>
              <div>Status</div>
              <div>Action</div>
            </div>

            <div>
              {loading ? (
                <div className="p-6 text-center text-gray-500">Loading...</div>
              ) : totalAppointments === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No appointments found for this patient.
                </div>
              ) : (
                visibleAppointments.map((a, idx) => {
                  const status = a.cancelled
                    ? "Cancelled"
                    : a.isCompleted
                    ? "Completed"
                    : "Pending";
                  return (
                    <div
                      key={a._id || idx}
                      className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 items-center p-4 border-b hover:bg-gray-50"
                    >
                      <div className="text-sm text-gray-800">
                        {a.slotDate
                          ? slotDateFormat(a.slotDate)
                          : a.date
                          ? new Date(a.date).toLocaleDateString()
                          : "—"}
                      </div>
                      <div className="text-sm">{a.slotTime || "—"}</div>
                      <div className="text-sm">
                        {status === "Cancelled" ? (
                          <span className="text-red-500 text-xs font-medium">
                            Cancelled
                          </span>
                        ) : status === "Completed" ? (
                          <span className="text-green-600 text-xs font-medium">
                            Completed
                          </span>
                        ) : (
                          <span className="text-yellow-600 text-xs font-medium">
                            Pending
                          </span>
                        )}
                      </div>

                      <div>
                        {!a.cancelled && (
                          <button
                            onClick={() =>
                              navigate(`/doctor-appointment/${a._id}`)
                            }
                            className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
                          >
                            Details
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* pagination controls for slots */}
            {totalAppointments > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-white">
                <div className="text-sm text-gray-600">
                  Showing {totalAppointments === 0 ? 0 : startIndex + 1} -{" "}
                  {endIndex} of {totalAppointments}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className={`px-3 py-1 border rounded text-sm ${
                      currentPage === 1
                        ? "opacity-50 pointer-events-none"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    Prev
                  </button>

                  <div className="hidden sm:flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (p) => (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`px-3 py-1 rounded text-sm ${
                            p === currentPage
                              ? "bg-primary text-white"
                              : "hover:bg-gray-100"
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className={`px-3 py-1 border rounded text-sm ${
                      currentPage === totalPages
                        ? "opacity-50 pointer-events-none"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column: All Attachments folder (on small screens will appear on top due to flex-col-reverse) */}
        <div className="w-full sm:w-80">
          <div className="bg-white border rounded p-6 flex flex-col items-center gap-4">
            <img
              src={assets.folder_icon500}
              alt="All Attachments"
              className="w-36 h-36 object-contain"
            />
            <div className="text-center">
              <h3 className="font-medium text-lg">All Attachments</h3>
              <p className="text-xs text-gray-500 mt-1">
                {totalAttachments} file{totalAttachments !== 1 ? "s" : ""}{" "}
                across{" "}
                {
                  appointments.filter(
                    (a) => (a?.clinical?.attachments || []).length > 0
                  ).length
                }{" "}
                appointment
                {appointments.filter(
                  (a) => (a?.clinical?.attachments || []).length > 0
                ).length !== 1
                  ? "s"
                  : ""}
              </p>
            </div>

            <div className="flex gap-2 w-full">
              <button
                onClick={() =>
                  navigate(`/doctor-patient/${userId}/attachments`)
                }
                className="flex-1 px-3 py-2 border rounded bg-primary text-white"
                disabled={totalAttachments === 0}
              >
                Open folders
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorPatientDetails;
