import React, { useContext, useEffect, useState } from "react";
import { AppContext } from "../context/AppContext";
import { useNavigate, useParams } from "react-router-dom";

const Doctors = () => {
  const { speciality } = useParams();
  const [filterDoc, setFilterDoc] = useState([]);
  const [showFilter, setShowFilter] = useState(false);
  const navigate = useNavigate();
  const { doctors } = useContext(AppContext);

  // Define specialties for the filter panel
  const specialties = [
    "General physician",
    "Gynecologist",
    "Dermatologist",
    "Pediatricians",
    "Neurologist",
    "Gastroenterologist",
  ];

  const applyFilter = () => {
    if (speciality && doctors) {
      setFilterDoc(doctors.filter((doc) => doc.speciality === speciality));
    } else if (doctors) {
      setFilterDoc(doctors);
    }
  };

  useEffect(() => {
    applyFilter();
  }, [doctors, speciality]);

  return (
    <div className="p-4 sm:p-6">
      <p className="text-gray-600">Browse through the doctors specialist.</p>

      <div className="flex flex-col lg:flex-row items-start gap-6 mt-5">
        {/* Filter button for mobile */}
        <button
          onClick={() => setShowFilter(!showFilter)}
          className={`py-2 px-4 border rounded-md text-sm transition-all lg:hidden ${
            showFilter
              ? "bg-primary text-white border-primary"
              : "border-gray-300"
          }`}
        >
          {showFilter ? "Hide Filters" : "Show Filters"}
        </button>

        {/* Filter panel */}
        <div
          className={`w-full lg:w-1/4 flex-col gap-3 text-sm text-gray-600 ${
            showFilter ? "flex" : "hidden lg:flex"
          }`}
        >
          {specialties.map((spec) => (
            <p
              key={spec}
              onClick={() =>
                speciality === spec
                  ? navigate("/doctors")
                  : navigate(`/doctors/${spec}`)
              }
              className={`pl-3 py-2.5 pr-16 border border-gray-300 rounded-md transition-all cursor-pointer hover:bg-blue-50 ${
                speciality === spec
                  ? "bg-[#E2E5FF] text-black border-primary/50"
                  : ""
              }`}
            >
              {spec}
            </p>
          ))}
        </div>

        {/* Doctors grid - FIXED HERE */}
        <div className="w-full lg:w-3/4">
          {filterDoc.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              {filterDoc.map((item, index) => (
                <div
                  onClick={() => {
                    navigate(`/appointments/${item._id}`);
                    scrollTo(0, 0);
                  }}
                  className="border border-[#C9D8FF] rounded-xl overflow-hidden cursor-pointer hover:translate-y-[-5px] transition-all duration-300 shadow-sm hover:shadow-md bg-white"
                  key={item._id || index}
                >
                  <img
                    className="w-full h-48 object-cover bg-[#EAEFFF]"
                    src={item.image}
                    alt={item.name}
                  />
                  <div className="p-4">
                    <div
                      className={`flex items-center gap-2 text-sm ${
                        item.available ? "text-green-500" : "text-gray-500"
                      }`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          item.available ? "bg-green-500" : "bg-gray-500"
                        }`}
                      ></div>
                      <p>{item.available ? "Available" : "Not Available"}</p>
                    </div>
                    <p className="text-[#262626] text-lg font-medium mt-2">
                      {item.name}
                    </p>
                    <p className="text-[#5C5C5C] text-sm mt-1">
                      {item.speciality}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">
                {speciality
                  ? `No ${speciality} doctors found`
                  : "No doctors available"}
              </p>
              {speciality && (
                <button
                  onClick={() => navigate("/doctors")}
                  className="mt-4 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                >
                  View All Doctors
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Doctors;
