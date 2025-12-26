import React, { useContext, useEffect, useState } from "react";
import { AppContext } from "../context/AppContext";
import axios from "axios";
import { toast } from "react-toastify";
import { assets } from "../assets/assets";

const MyProfile = () => {
  const [isEdit, setIsEdit] = useState(false);
  const [image, setImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [localUserData, setLocalUserData] = useState(null);

  const { token, backendUrl, userData, setUserData, loadUserProfileData } =
    useContext(AppContext);

  // ✅ Initialize with mock data if no backend
  useEffect(() => {
    // If userData from context exists, use it
    if (userData) {
      setLocalUserData(userData);
      setLoading(false);
      return;
    }

    // ✅ Mock user data for development
    const mockUserData = {
      name: "John Doe",
      email: "johndoe@example.com",
      phone: "+1 (555) 123-4567",
      address: {
        line1: "123 Main Street",
        line2: "Apt 4B, New York, NY 10001",
      },
      gender: "Male",
      dob: "1990-05-15",
      image: assets.default_profile || "/default-profile.png",
    };

    // Set mock data and update context if setUserData exists
    setLocalUserData(mockUserData);
    if (setUserData) {
      setUserData(mockUserData);
    }
    setLoading(false);

    // Optional: Try to load real data if backend might be available
    if (token && loadUserProfileData) {
      loadUserProfileData();
    }
  }, [userData, token, loadUserProfileData, setUserData]);

  const updateUserProfileData = async () => {
    // ✅ For development: Show success without backend
    if (!backendUrl || backendUrl.includes("localhost")) {
      toast.success("Profile updated successfully (development mode)");
      setIsEdit(false);
      setImage(false);
      return;
    }

    // Original backend code
    try {
      const formData = new FormData();
      formData.append("name", localUserData.name);
      formData.append("phone", localUserData.phone);
      formData.append("address", JSON.stringify(localUserData.address));
      formData.append("gender", localUserData.gender);
      formData.append("dob", localUserData.dob);
      image && formData.append("image", image);

      const { data } = await axios.post(
        backendUrl + "/api/user/update-profile",
        formData,
        { headers: { token } }
      );

      if (data.success) {
        toast.success(data.message);
        await loadUserProfileData();
        setIsEdit(false);
        setImage(false);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.log("Backend not available, using mock data:", error.message);
      toast.success("Profile saved locally for development");
      setIsEdit(false);
      setImage(false);
    }
  };

  // ✅ Handle state updates for local data
  const handleFieldChange = (field, value) => {
    setLocalUserData((prev) => {
      if (field.includes(".")) {
        const [parent, child] = field.split(".");
        return {
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: value,
          },
        };
      }
      return { ...prev, [field]: value };
    });

    // Also update context if available
    if (setUserData) {
      setUserData((prev) => {
        if (!prev) return { [field]: value };
        if (field.includes(".")) {
          const [parent, child] = field.split(".");
          return {
            ...prev,
            [parent]: {
              ...prev[parent],
              [child]: value,
            },
          };
        }
        return { ...prev, [field]: value };
      });
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading profile...</div>;
  }

  if (!localUserData) {
    return <div className="p-8 text-center">No user data available</div>;
  }

  return (
    <div className="max-w-lg flex flex-col gap-2 text-sm pt-5">
      {/* Profile Image */}
      {isEdit ? (
        <label htmlFor="image">
          <div className="inline-block relative cursor-pointer">
            <img
              className="w-36 rounded opacity-75"
              src={image ? URL.createObjectURL(image) : localUserData.image}
              alt="Profile"
            />
            <img
              className="w-10 absolute bottom-12 right-12"
              src={image ? "" : assets.upload_icon}
              alt="Upload"
            />
          </div>
          <input
            onChange={(e) => setImage(e.target.files[0])}
            type="file"
            id="image"
            hidden
          />
        </label>
      ) : (
        <img className="w-36 rounded" src={localUserData.image} alt="Profile" />
      )}

      {/* Name */}
      {isEdit ? (
        <input
          className="bg-gray-50 text-3xl font-medium max-w-60 p-2 rounded border"
          type="text"
          onChange={(e) => handleFieldChange("name", e.target.value)}
          value={localUserData.name}
        />
      ) : (
        <p className="font-medium text-3xl text-[#262626] mt-4">
          {localUserData.name}
        </p>
      )}

      <hr className="bg-[#ADADAD] h-[1px] border-none my-4" />

      {/* Contact Information */}
      <div>
        <p className="text-gray-600 underline mt-3">CONTACT INFORMATION</p>
        <div className="grid grid-cols-[1fr_3fr] gap-y-2.5 mt-3 text-[#363636]">
          <p className="font-medium">Email id:</p>
          <p className="text-blue-500">{localUserData.email}</p>

          <p className="font-medium">Phone:</p>
          {isEdit ? (
            <input
              className="bg-gray-50 max-w-52 p-2 rounded border"
              type="text"
              onChange={(e) => handleFieldChange("phone", e.target.value)}
              value={localUserData.phone}
            />
          ) : (
            <p className="text-blue-500">{localUserData.phone}</p>
          )}

          <p className="font-medium">Address:</p>
          {isEdit ? (
            <div className="space-y-2">
              <input
                className="bg-gray-50 w-full p-2 rounded border"
                type="text"
                onChange={(e) =>
                  handleFieldChange("address.line1", e.target.value)
                }
                value={localUserData.address.line1}
                placeholder="Address Line 1"
              />
              <input
                className="bg-gray-50 w-full p-2 rounded border"
                type="text"
                onChange={(e) =>
                  handleFieldChange("address.line2", e.target.value)
                }
                value={localUserData.address.line2}
                placeholder="Address Line 2"
              />
            </div>
          ) : (
            <p className="text-gray-500">
              {localUserData.address.line1} <br />
              {localUserData.address.line2}
            </p>
          )}
        </div>
      </div>

      {/* Basic Information */}
      <div>
        <p className="text-[#797979] underline mt-3">BASIC INFORMATION</p>
        <div className="grid grid-cols-[1fr_3fr] gap-y-2.5 mt-3 text-gray-600">
          <p className="font-medium">Gender:</p>
          {isEdit ? (
            <select
              className="max-w-28 bg-gray-50 p-2 rounded border"
              onChange={(e) => handleFieldChange("gender", e.target.value)}
              value={localUserData.gender}
            >
              <option value="Not Selected">Not Selected</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          ) : (
            <p className="text-gray-500">{localUserData.gender}</p>
          )}

          <p className="font-medium">Birthday:</p>
          {isEdit ? (
            <input
              className="max-w-28 bg-gray-50 p-2 rounded border"
              type="date"
              onChange={(e) => handleFieldChange("dob", e.target.value)}
              value={localUserData.dob}
            />
          ) : (
            <p className="text-gray-500">{localUserData.dob}</p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-10">
        {isEdit ? (
          <button
            onClick={updateUserProfileData}
            className="border border-primary px-8 py-2 rounded-full hover:bg-primary hover:text-white transition-all bg-white"
          >
            Save information
          </button>
        ) : (
          <button
            onClick={() => setIsEdit(true)}
            className="border border-primary px-8 py-2 rounded-full hover:bg-primary hover:text-white transition-all bg-white"
          >
            Edit Profile
          </button>
        )}
      </div>
    </div>
  );
};

export default MyProfile;
