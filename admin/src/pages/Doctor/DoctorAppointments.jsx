// frontend/src/pages/DoctorAppointments.jsx
import React, { useContext, useEffect, useState } from "react";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";
import { assets } from "../../assets/assets";
import DoctorCompleteModal from "../../components/DoctorCompleteModal";

const DoctorAppointments = () => {
  const { dToken, appointments, getAppointments, cancelAppointment } =
    useContext(DoctorContext);

  const { calculateAge, slotDateFormat, currency } = useContext(AppContext);

  const [openModal, setOpenModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [cancellingId, setCancellingId] = useState(null); // track which row is being cancelled

  useEffect(() => {
    if (dToken) {
      getAppointments();
    }
  }, [dToken]);

  // When the user clicks the tick icon we'll open the modal
  const onOpenCompleteModal = (appointment) => {
    setSelectedAppointment(appointment);
    setOpenModal(true);
  };

  // Called after modal saves — refresh list and close modal
  const handleSaved = (updatedAppointment) => {
    // refresh appointments from server
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

  return (
    <div className="w-full max-w-6xl m-5">
      <p className="mb-3 text-lg font-medium">All Appointments</p>

      <div className="bg-white border rounded text-sm max-h-[80vh] min-h-[50vh]">
        <div className="max-sm:hidden grid grid-cols-[0.5fr_2fr_1fr_1fr_3fr_1fr_1fr] gap-1 py-3 px-6 border-b">
          <p>#</p>
          <p>Patient</p>
          <p>Payment</p>
          <p>Age</p>
          <p>Date & Time</p>
          <p>Fees</p>
          <p>Action</p>
        </div>

        {appointments
          .slice() // copy so we don't mutate original array
          // NOTE: do NOT reverse here — backend returns newest-first via .sort({date: -1})
          .map((item, index) => {
            const isCancelled = !!item.cancelled;
            const isCompleted = !!item.isCompleted;
            const isBusy = cancellingId === item._id;

            return (
              <div
                className="flex flex-wrap justify-between max-sm:gap-5 max-sm:text-base sm:grid grid-cols-[0.5fr_2fr_1fr_1fr_3fr_1fr_1fr] gap-1 items-center text-gray-500 py-3 px-6 border-b hover:bg-gray-50"
                key={item._id || index}
              >
                <p className="max-sm:hidden">{index + 1}</p>
                <div className="flex items-center gap-2">
                  <img
                    className="w-8 rounded-full"
                    src={item.userData?.image}
                    alt=""
                  />{" "}
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
                  <p className="text-red-400 text-xs font-medium">Cancelled</p>
                ) : isCompleted ? (
                  <p className="text-green-500 text-xs font-medium">
                    Completed
                  </p>
                ) : (
                  <div className="flex">
                    {/* Cancel icon: disabled while cancelling */}
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

                    {/* Complete icon: disabled while cancelling */}
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
          })}
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
