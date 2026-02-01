// frontend/src/pages/MyAppointments.jsx
import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppContext } from "../context/AppContext";
import axios from "axios";
import { toast } from "react-toastify";
import { assets } from "../assets/assets";

const MyAppointments = () => {
  const { backendUrl, token } = useContext(AppContext);
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState([]);
  const [payment, setPayment] = useState("");
  const [downloading, setDownloading] = useState(null); // appointmentId being downloaded

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const slotDateFormat = (slotDate) => {
    if (!slotDate) return "";
    const dateArray = slotDate.split("_");
    if (dateArray.length < 3) return slotDate;
    return (
      dateArray[0] + " " + months[Number(dateArray[1])] + " " + dateArray[2]
    );
  };

  // Getting User Appointments Data Using API
  const getUserAppointments = async () => {
    if (!token) return;
    try {
      // user endpoints expect header { token }
      const { data } = await axios.get(backendUrl + "/api/user/appointments", {
        headers: { token },
      });
      setAppointments((data.appointments || []).reverse());
    } catch (error) {
      console.error("getUserAppointments error:", error);
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to load appointments",
      );
    }
  };

  // cancel appointment
  const cancelAppointment = async (appointmentId) => {
    try {
      const { data } = await axios.post(
        backendUrl + "/api/user/cancel-appointment",
        { appointmentId },
        { headers: { token } },
      );

      if (data.success) {
        toast.success(data.message);
        getUserAppointments();
      } else {
        toast.error(data.message || "Cancel failed");
      }
    } catch (error) {
      console.error("cancelAppointment error:", error);
      toast.error(
        error?.response?.data?.message || error?.message || "Cancel failed",
      );
    }
  };

  const initPay = (order) => {
    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: "Appointment Payment",
      description: "Appointment Payment",
      order_id: order.id,
      receipt: order.receipt,
      handler: async (response) => {
        try {
          const { data } = await axios.post(
            backendUrl + "/api/user/verifyRazorpay",
            response,
            { headers: { token } },
          );
          if (data.success) {
            navigate("/my-appointments");
            getUserAppointments();
          }
        } catch (error) {
          console.error("verifyRazorpay error:", error);
          toast.error(
            error?.response?.data?.message ||
              error?.message ||
              "Payment verification failed",
          );
        }
      },
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const appointmentRazorpay = async (appointmentId) => {
    try {
      const { data } = await axios.post(
        backendUrl + "/api/user/payment-razorpay",
        { appointmentId },
        { headers: { token } },
      );
      if (data.success) {
        initPay(data.order);
      } else {
        toast.error(data.message || "Payment init failed");
      }
    } catch (error) {
      console.error("appointmentRazorpay error:", error);
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Payment init failed",
      );
    }
  };

  const appointmentStripe = async (appointmentId) => {
    try {
      const { data } = await axios.post(
        backendUrl + "/api/user/payment-stripe",
        { appointmentId },
        { headers: { token } },
      );
      if (data.success) {
        const { session_url } = data;
        window.location.replace(session_url);
      } else {
        toast.error(data.message || "Payment init failed");
      }
    } catch (error) {
      console.error("appointmentStripe error:", error);
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Payment init failed",
      );
    }
  };

  useEffect(() => {
    if (token) {
      getUserAppointments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Download appointment PDF (ticket or full)
  const downloadAppointmentPdf = async (appointmentId, mode = "full") => {
    if (!token) {
      toast.error("Not authenticated");
      return;
    }
    setDownloading(appointmentId);
    try {
      const resp = await axios.get(
        `${backendUrl}/api/records/appointments/${appointmentId}/pdf?mode=${encodeURIComponent(mode)}`,
        {
          // requireAuth expects Authorization: Bearer <jwt>
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        },
      );

      const contentType = resp.headers["content-type"] || "application/pdf";
      if (!contentType.includes("pdf")) {
        // server returned non-PDF (error) — try to convert to text for debug
        // note: blob -> text needs Response object; using blob().then
        const text = await resp.data.text();
        console.error("Non-PDF response from PDF endpoint:", text);
        toast.error("Failed to download PDF (server error).");
        return;
      }

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
    } catch (error) {
      console.error("downloadAppointmentPdf error:", error);
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        toast.error("You are not authorized to download this PDF.");
      } else {
        toast.error(error?.response?.data?.message || "Failed to download PDF");
      }
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <p className="pb-3 mt-12 text-lg font-medium text-gray-600 border-b">
        My appointments
      </p>
      <div className="">
        {appointments.map((item, index) => (
          <div
            key={index}
            className="grid grid-cols-[1fr_2fr] gap-4 sm:flex sm:gap-6 py-4 border-b"
          >
            <div>
              <img
                className="w-36 bg-[#EAEFFF]"
                src={item.docData?.image}
                alt=""
              />
            </div>
            <div className="flex-1 text-sm text-[#5E5E5E]">
              <p className="text-[#262626] text-base font-semibold">
                {item.docData?.name}
              </p>
              <p>{item.docData?.speciality}</p>
              <p className="text-[#464646] font-medium mt-1">Address:</p>
              <p className="">{item.docData?.address?.line1}</p>
              <p className="">{item.docData?.address?.line2}</p>
              <p className=" mt-1">
                <span className="text-sm text-[#3C3C3C] font-medium">
                  Date & Time:
                </span>{" "}
                {slotDateFormat(item.slotDate)} | {item.slotTime}
              </p>
            </div>
            <div></div>
            <div className="flex flex-col gap-2 justify-end text-sm text-center">
              {!item.cancelled &&
                !item.payment &&
                !item.isCompleted &&
                payment !== item._id && (
                  <button
                    onClick={() => setPayment(item._id)}
                    className="text-[#696969] sm:min-w-48 py-2 border rounded hover:bg-primary hover:text-white transition-all duration-300"
                  >
                    Pay Online
                  </button>
                )}

              {!item.cancelled &&
                !item.payment &&
                !item.isCompleted &&
                payment === item._id && (
                  <>
                    <button
                      onClick={() => appointmentStripe(item._id)}
                      className="text-[#696969] sm:min-w-48 py-2 border rounded hover:bg-gray-100 hover:text-white transition-all duration-300 flex items-center justify-center"
                    >
                      <img
                        className="max-w-20 max-h-5"
                        src={assets.stripe_logo}
                        alt=""
                      />
                    </button>
                    <button
                      onClick={() => appointmentRazorpay(item._id)}
                      className="text-[#696969] sm:min-w-48 py-2 border rounded hover:bg-gray-100 hover:text-white transition-all duration-300 flex items-center justify-center"
                    >
                      <img
                        className="max-w-20 max-h-5"
                        src={assets.razorpay_logo}
                        alt=""
                      />
                    </button>
                  </>
                )}

              {!item.cancelled && item.payment && !item.isCompleted && (
                <button className="sm:min-w-48 py-2 border rounded text-[#696969] bg-[#EAEFFF]">
                  Paid
                </button>
              )}

              {item.isCompleted && (
                <button className="sm:min-w-48 py-2 border border-green-500 rounded text-green-500">
                  Completed
                </button>
              )}

              {!item.cancelled && !item.isCompleted && (
                <button
                  onClick={() => cancelAppointment(item._id)}
                  className="text-[#696969] sm:min-w-48 py-2 border rounded hover:bg-red-600 hover:text-white transition-all duration-300"
                >
                  Cancel appointment
                </button>
              )}
              {item.cancelled && !item.isCompleted && (
                <button className="sm:min-w-48 py-2 border border-red-500 rounded text-red-500">
                  Appointment cancelled
                </button>
              )}

              {/* PDF download controls for patient */}
              <div className="mt-2">
                {!item.isCompleted ? (
                  <button
                    onClick={() => downloadAppointmentPdf(item._id, "ticket")}
                    className="px-3 py-2 border rounded text-sm bg-blue-50 hover:bg-blue-100"
                    disabled={downloading === item._id}
                  >
                    {downloading === item._id
                      ? "Downloading..."
                      : "Download ticket"}
                  </button>
                ) : (
                  <button
                    onClick={() => downloadAppointmentPdf(item._id, "full")}
                    className="px-3 py-2 border rounded text-sm bg-blue-50 hover:bg-blue-100"
                    disabled={downloading === item._id}
                  >
                    {downloading === item._id
                      ? "Downloading..."
                      : "Download appointment PDF"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyAppointments;
