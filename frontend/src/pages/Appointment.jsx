import React, { useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppContext } from "../context/AppContext";
import { assets } from "../assets/assets";
import RelatedDoctors from "../components/RelatedDoctors";
import axios from "axios";
import { toast } from "react-toastify";

const Appointment = () => {
  const { docId } = useParams();
  const { doctors, currencySymbol, backendUrl, token, getDoctosData } =
    useContext(AppContext);
  const daysOfWeek = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  const [docInfo, setDocInfo] = useState(false);
  const [docSlots, setDocSlots] = useState([]);
  const [slotIndex, setSlotIndex] = useState(0);
  const [slotTime, setSlotTime] = useState("");

  const navigate = useNavigate();

  const fetchDocInfo = async () => {
    const docInfo = doctors.find((doc) => doc._id === docId);
    setDocInfo(docInfo);
  };

  const getAvailableSolts = () => {
    if (!docInfo) return;

    // Create a new array to hold all time slots for the next 7 days
    const allSlots = [];

    // Get current date and time
    const now = new Date();

    // Generate slots for next 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);

      // Set start time based on whether it's today or future day
      const startTime = new Date(date);
      if (i === 0) {
        // For today, start from current hour + 1, but not before 10 AM
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        if (currentHour < 10) {
          startTime.setHours(10, 0, 0, 0);
        } else {
          // Round up to next 30-minute interval
          if (currentMinute >= 30) {
            startTime.setHours(currentHour + 1, 0, 0, 0);
          } else {
            startTime.setHours(currentHour, 30, 0, 0);
          }
        }
      } else {
        // For future days, start at 10 AM
        startTime.setHours(10, 0, 0, 0);
      }

      // Set end time to 9 PM (21:00)
      const endTime = new Date(date);
      endTime.setHours(21, 0, 0, 0);

      // If start time is after end time for today, skip this day
      if (startTime >= endTime) {
        allSlots.push([]);
        continue;
      }

      const daySlots = [];
      const currentSlotTime = new Date(startTime);

      while (currentSlotTime < endTime) {
        const formattedTime = currentSlotTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        const day = currentSlotTime.getDate();
        const month = currentSlotTime.getMonth() + 1;
        const year = currentSlotTime.getFullYear();
        const slotDate = `${day}_${month}_${year}`;

        // Check if slot is available
        const isSlotAvailable =
          docInfo.slots_booked && docInfo.slots_booked[slotDate]
            ? !docInfo.slots_booked[slotDate].includes(formattedTime)
            : true;

        if (isSlotAvailable) {
          daySlots.push({
            datetime: new Date(currentSlotTime),
            time: formattedTime,
          });
        }

        // Move to next 30-minute slot
        currentSlotTime.setMinutes(currentSlotTime.getMinutes() + 30);
      }

      allSlots.push(daySlots);
    }

    setDocSlots(allSlots);
  };

  const bookAppointment = async () => {
    if (!token) {
      toast.warning("Login to book appointment");
      return navigate("/login");
    }

    if (!slotTime) {
      toast.warning("Please select a time slot");
      return;
    }

    const date = docSlots[slotIndex][0].datetime;

    let day = date.getDate();
    let month = date.getMonth() + 1;
    let year = date.getFullYear();

    const slotDate = day + "_" + month + "_" + year;

    try {
      const { data } = await axios.post(
        backendUrl + "/api/user/book-appointment",
        { docId, slotDate, slotTime },
        { headers: { token } }
      );
      if (data.success) {
        toast.success(data.message);
        getDoctosData();
        navigate("/my-appointments");
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.log(error);
      toast.error(error.message || "Failed to book appointment");
    }
  };

  useEffect(() => {
    if (doctors.length > 0) {
      fetchDocInfo();
    }
  }, [doctors, docId]);

  useEffect(() => {
    if (docInfo) {
      getAvailableSolts();
    }
  }, [docInfo]);

  return docInfo ? (
    <div>
      {/* ---------- Doctor Details ----------- */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div>
          <img
            className="bg-primary w-full sm:max-w-72 rounded-lg"
            src={docInfo.image}
            alt=""
          />
        </div>

        <div className="flex-1 border border-[#ADADAD] rounded-lg p-8 py-7 bg-white mx-2 sm:mx-0 mt-[-80px] sm:mt-0">
          {/* ----- Doc Info : name, degree, experience ----- */}

          <p className="flex items-center gap-2 text-3xl font-medium text-gray-700">
            {docInfo.name}{" "}
            <img className="w-5" src={assets.verified_icon} alt="" />
          </p>
          <div className="flex items-center gap-2 mt-1 text-gray-600">
            <p>
              {docInfo.degree} - {docInfo.speciality}
            </p>
            <button className="py-0.5 px-2 border text-xs rounded-full">
              {docInfo.experience}
            </button>
          </div>

          {/* ----- Doc About ----- */}
          <div>
            <p className="flex items-center gap-1 text-sm font-medium text-[#262626] mt-3">
              About <img className="w-3" src={assets.info_icon} alt="" />
            </p>
            <p className="text-sm text-gray-600 max-w-[700px] mt-1">
              {docInfo.about}
            </p>
          </div>

          <p className="text-gray-600 font-medium mt-4">
            Appointment fee:{" "}
            <span className="text-gray-800">
              {currencySymbol}
              {docInfo.fees}
            </span>{" "}
          </p>
        </div>
      </div>

      {/* Booking slots */}
      <div className="sm:ml-72 sm:pl-4 mt-8 font-medium text-[#565656]">
        <p>Booking slots</p>
        <div className="flex gap-3 items-center w-full overflow-x-scroll mt-4">
          {docSlots.map((item, index) => (
            <div
              onClick={() => {
                setSlotIndex(index);
                setSlotTime(""); // Reset time selection when changing day
              }}
              key={index}
              className={`text-center py-6 min-w-16 rounded-full cursor-pointer ${
                slotIndex === index
                  ? "bg-primary text-white"
                  : "border border-[#DDDDDD]"
              } ${item.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <p>{item[0] ? daysOfWeek[item[0].datetime.getDay()] : "N/A"}</p>
              <p>{item[0] ? item[0].datetime.getDate() : "-"}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full overflow-x-scroll mt-4">
          {docSlots[slotIndex] && docSlots[slotIndex].length > 0 ? (
            docSlots[slotIndex].map((item, index) => (
              <p
                onClick={() => setSlotTime(item.time)}
                key={index}
                className={`text-sm font-light flex-shrink-0 px-5 py-2 rounded-full cursor-pointer ${
                  item.time === slotTime
                    ? "bg-primary text-white"
                    : "text-[#949494] border border-[#B4B4B4]"
                }`}
              >
                {item.time.toLowerCase()}
              </p>
            ))
          ) : (
            <p className="text-gray-500">No available slots for this day</p>
          )}
        </div>

        <button
          onClick={bookAppointment}
          disabled={!slotTime}
          className={`bg-primary text-white text-sm font-light px-20 py-3 rounded-full my-6 ${
            !slotTime ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          Book an appointment
        </button>
      </div>

      {/* Listing Releated Doctors */}
      <RelatedDoctors speciality={docInfo.speciality} docId={docId} />
    </div>
  ) : (
    <div className="p-8 text-center">Loading doctor information...</div>
  );
};

export default Appointment;
