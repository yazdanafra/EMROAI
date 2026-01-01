// admin/src/pages/Doctor/DoctorPatients.jsx
import React, { useContext, useEffect } from "react";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";
import { Link, useNavigate } from "react-router-dom";

const DoctorPatients = () => {
  const { patients, getPatients, dToken } = useContext(DoctorContext);
  const { slotDateFormat } = useContext(AppContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (dToken) getPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dToken]);

  return (
    <div className="m-5">
      <h1 className="text-lg font-medium mb-4">Patients (Visited)</h1>

      {patients.length === 0 ? (
        <p className="text-gray-500">No visited patients yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {patients.map((p) => (
            <div
              key={p.userId}
              className="border rounded p-4 flex items-center gap-3 hover:shadow cursor-pointer"
              onClick={() => {
                // TODO: later decide where to go — for now navigate to a placeholder patient route
                navigate(`/doctor-patient/${p.userId}`);
              }}
            >
              <img
                src={p.userData?.image || "/placeholder-avatar.png"}
                alt=""
                className="w-14 h-14 rounded-full object-cover"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-800">
                  {p.userData?.name || "Unknown Patient"}
                </p>
                <p className="text-sm text-gray-500">
                  Last visited:{" "}
                  {p.lastVisited
                    ? typeof p.lastVisited === "string"
                      ? p.lastVisited
                      : new Date(p.lastVisited).toLocaleString()
                    : "—"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DoctorPatients;
