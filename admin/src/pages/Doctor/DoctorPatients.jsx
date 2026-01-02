// admin/src/pages/Doctor/DoctorPatients.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { DoctorContext } from "../../context/DoctorContext";
import { AppContext } from "../../context/AppContext";
import { Link, useNavigate } from "react-router-dom";

const DoctorPatients = () => {
  const { patients, getPatients, dToken } = useContext(DoctorContext);
  const { slotDateFormat } = useContext(AppContext);
  const navigate = useNavigate();

  // search state
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (dToken) getPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dToken]);

  const filtered = useMemo(() => {
    const q = (searchTerm || "").trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => {
      const name = String(p.userData?.name || "").toLowerCase();
      if (name.includes(q)) return true;
      const uid = String(p.userId || "").toLowerCase();
      if (uid.includes(q)) return true;
      return false;
    });
  }, [patients, searchTerm]);

  return (
    <div className="m-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium">Patients (Visited)</h1>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search patients by name or id..."
            className="px-3 py-2 border rounded text-sm"
          />
          <button
            onClick={() => setSearchTerm("")}
            className="px-3 py-2 border rounded text-sm"
          >
            Clear
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500">No visited patients yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div
              key={p.userId}
              className="border rounded p-4 flex items-center gap-3 hover:shadow cursor-pointer"
              onClick={() => {
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
