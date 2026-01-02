// frontend/src/pages/DoctorAppointments.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";
import { assets } from "../../assets/assets";
import DoctorCompleteModal from "../../components/DoctorCompleteModal";

/* getAppointmentDate unchanged (kept for brevity) */
function getAppointmentDate(apt) {
  const { slotDate, slotTime, date } = apt || {};
  const tryParse = (s) => {
    if (!s) return null;
    const d = new Date(s);
    if (!isNaN(d)) return d;
    const d2 = new Date(s.replace(/-/g, "/"));
    if (!isNaN(d2)) return d2;
    return null;
  };

  if (slotDate) {
    const combined = slotTime ? `${slotDate} ${slotTime}` : `${slotDate}`;
    const parsed = tryParse(combined);
    if (parsed) return parsed;

    const parts = String(slotDate)
      .split(/[-\/.]/)
      .map((p) => p.trim());
    if (parts.length === 3) {
      let iso = slotDate;
      if (parts[0].length === 4) {
        iso = `${parts[0]}-${parts[1]}-${parts[2]}`;
      } else {
        iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      const parsed2 = tryParse(slotTime ? `${iso} ${slotTime}` : iso);
      if (parsed2) return parsed2;
    }
  }

  if (date) {
    const parsed = tryParse(date);
    if (parsed) return parsed;
  }

  return new Date(NaN);
}

const DoctorAppointments = () => {
  const { dToken, appointments, getAppointments, cancelAppointment } =
    useContext(DoctorContext);

  const { calculateAge, slotDateFormat, currency } = useContext(AppContext);

  const [openModal, setOpenModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [cancellingId, setCancellingId] = useState(null); // track which row is being cancelled

  // SEARCH state
  const [searchTerm, setSearchTerm] = useState("");

  // pagination state
  const PAGE_SIZE = 10; // show 10 appointments per page
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (dToken) {
      getAppointments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dToken]);

  // Whenever appointments change, reset to first page (or clamp page)
  useEffect(() => {
    setCurrentPage(1);
  }, [appointments?.length]);

  // Sort appointments by scheduled datetime (newest first)
  const sortedAppointments = useMemo(() => {
    if (!Array.isArray(appointments)) return [];
    const mapped = appointments.map((a) => {
      const dt = getAppointmentDate(a);
      const timeMs = dt && !isNaN(dt.getTime()) ? dt.getTime() : -Infinity;
      return { a, timeMs };
    });

    mapped.sort((x, y) => {
      if (y.timeMs !== x.timeMs) return y.timeMs - x.timeMs;
      const ta = new Date(x.a.date || x.a.createdAt || 0).getTime() || 0;
      const tb = new Date(y.a.date || y.a.createdAt || 0).getTime() || 0;
      return tb - ta;
    });

    return mapped.map((m) => m.a);
  }, [appointments]);

  // Filtered by searchTerm (patient name, slotDate, slotTime, id, amount)
  const filteredAppointments = useMemo(() => {
    const q = (searchTerm || "").trim().toLowerCase();
    if (!q) return sortedAppointments;

    return sortedAppointments.filter((it) => {
      // patient name
      const name = String(it.userData?.name || "").toLowerCase();
      if (name.includes(q)) return true;

      // slot date formatted
      const slotDateStr = it.slotDate
        ? String(slotDateFormat(it.slotDate)).toLowerCase()
        : "";
      if (slotDateStr.includes(q)) return true;

      // slot time
      const slotTimeStr = String(it.slotTime || "").toLowerCase();
      if (slotTimeStr.includes(q)) return true;

      // appointment id
      if ((it._id || "").toLowerCase().includes(q)) return true;

      // amount
      if (
        String(it.amount || "")
          .toLowerCase()
          .includes(q)
      )
        return true;

      return false;
    });
  }, [sortedAppointments, searchTerm, slotDateFormat]);

  // ensure currentPage is valid if filteredAppointments shrink
  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil((filteredAppointments?.length || 0) / PAGE_SIZE)
    );
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [filteredAppointments, currentPage]);

  // When the user clicks the tick icon we'll open the modal
  const onOpenCompleteModal = (appointment) => {
    setSelectedAppointment(appointment);
    setOpenModal(true);
  };

  // Called after modal saves — refresh list and close modal
  const handleSaved = (updatedAppointment) => {
    getAppointments();
    setOpenModal(false);
    setSelectedAppointment(null);
  };

  // cancel handler that awaits the cancel request and refreshes the list
  const handleCancel = async (appointmentId) => {
    if (!appointmentId) return;
    try {
      setCancellingId(appointmentId);
      await cancelAppointment(appointmentId);
      await getAppointments();
    } catch (err) {
      console.error("failed to cancel appointment", err);
    } finally {
      setCancellingId(null);
    }
  };

  // Pagination helpers (use filteredAppointments)
  const totalAppointments = filteredAppointments?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalAppointments / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalAppointments);

  const visibleAppointments = (filteredAppointments || []).slice(
    startIndex,
    endIndex
  );

  return (
    <div className="w-full max-w-6xl m-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-lg font-medium">All Appointments</p>

        {/* Search input */}
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // reset to first page on search
            }}
            placeholder="Search by patient, date, time, id or amount..."
            className="px-3 py-2 border rounded text-sm"
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

      <div className="bg-white border rounded text-sm">
        {/* header */}
        <div className="max-sm:hidden grid grid-cols-[0.5fr_2fr_1fr_1fr_3fr_1fr_1fr] gap-1 py-3 px-6 border-b">
          <p>#</p>
          <p>Patient</p>
          <p>Payment</p>
          <p>Age</p>
          <p>Date & Time</p>
          <p>Fees</p>
          <p>Action</p>
        </div>

        {/* list container */}
        <div className="max-h-[60vh] min-h-[20vh] overflow-auto">
          {visibleAppointments.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No appointments found.
            </div>
          ) : (
            visibleAppointments.map((item, idx) => {
              const globalIndex = startIndex + idx + 1;
              const isCancelled = !!item.cancelled;
              const isCompleted = !!item.isCompleted;
              const isBusy = cancellingId === item._id;

              return (
                <div
                  className="flex flex-wrap justify-between max-sm:gap-5 max-sm:text-base sm:grid grid-cols-[0.5fr_2fr_1fr_1fr_3fr_1fr_1fr] gap-1 items-center text-gray-500 py-3 px-6 border-b hover:bg-gray-50"
                  key={item._id || globalIndex}
                >
                  <p className="max-sm:hidden">{globalIndex}</p>
                  <div className="flex items-center gap-2">
                    <img
                      className="w-8 rounded-full"
                      src={item.userData?.image}
                      alt=""
                    />
                    <p>{item.userData?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs inline border border-primary px-2 rounded-full">
                      {item.payment ? "Online" : "CASH"}
                    </p>
                  </div>
                  <p className="max-sm:hidden">
                    {calculateAge(item.userData?.dob)}
                  </p>
                  <p>
                    {slotDateFormat(item.slotDate)}, {item.slotTime}
                  </p>
                  <p>
                    {currency}
                    {item.amount}
                  </p>

                  {/* Action column */}
                  {isCancelled ? (
                    <p className="text-red-400 text-xs font-medium">
                      Cancelled
                    </p>
                  ) : isCompleted ? (
                    <p className="text-green-500 text-xs font-medium">
                      Completed
                    </p>
                  ) : (
                    <div className="flex">
                      <img
                        onClick={() => {
                          if (isBusy) return;
                          handleCancel(item._id);
                        }}
                        className={`w-10 cursor-pointer ${
                          isBusy ? "opacity-50 pointer-events-none" : ""
                        }`}
                        src={assets.cancel_icon}
                        alt="cancel"
                        title={isBusy ? "Cancelling..." : "Cancel appointment"}
                      />
                      <img
                        onClick={() => {
                          if (isBusy) return;
                          onOpenCompleteModal(item);
                        }}
                        className={`w-10 cursor-pointer ${
                          isBusy ? "opacity-50 pointer-events-none" : ""
                        }`}
                        src={assets.tick_icon}
                        alt="complete"
                        title="Complete appointment"
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* pagination controls */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-white">
          <div className="text-sm text-gray-600">
            Showing {totalAppointments === 0 ? 0 : startIndex + 1} - {endIndex}{" "}
            of {totalAppointments}
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
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
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
              ))}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
      </div>

      {/* Modal: only render when open */}
      {openModal && selectedAppointment && (
        <DoctorCompleteModal
          appointment={selectedAppointment}
          authToken={dToken}
          onClose={() => {
            setOpenModal(false);
            setSelectedAppointment(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default DoctorAppointments;
