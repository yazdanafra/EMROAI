import React, { useContext, useState } from "react";
import { assets } from "../assets/assets";
import { NavLink, useNavigate } from "react-router-dom";
import { AppContext } from "../context/AppContext";

const Navbar = () => {
  const navigate = useNavigate();
  const { token, setToken, userData } = useContext(AppContext);
  const [showMenu, setShowMenu] = useState(false);

  const logout = () => {
    setToken(false);
    localStorage.removeItem("token");
  };

  // Navigation items configuration
  const navItems = [
    { path: "/", label: "HOME" },
    { path: "/doctors", label: "ALL DOCTORS" },
    { path: "/about", label: "ABOUT" },
    { path: "/contact", label: "CONTACT" },
  ];

  return (
    <div className="flex items-center justify-between text-sm py-4 mb-5 border-b border-b-gray-400">
      <img
        onClick={() => navigate("/")}
        className="w-44 cursor-pointer"
        src={assets.logo}
        alt="Website logo"
      />

      {/* Desktop Navigation */}
      <ul className="hidden md:flex items-start gap-5 font-medium">
        {navItems.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                `relative py-1 block ${isActive ? "text-primary" : ""}`
              }
            >
              {item.label}
              {/* Blue line indicator - only visible when active */}
              <span
                className="absolute -bottom-6 left-0 right-0 h-0.5 bg-primary transition-all duration-300 opacity-0 group-hover:opacity-50 data-[active=true]:opacity-100"
                data-active={(useNavLinkActive) => useNavLinkActive.isActive}
              />
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-4">
        {token && userData ? (
          <div className="flex items-center gap-2 cursor-pointer group relative">
            <img
              className="w-8 rounded-full"
              src={userData.image}
              alt="User profile"
            />
            <img
              className="w-2.5"
              src={assets.dropdown_icon}
              alt="Dropdown icon"
            />
            <div className="absolute top-0 right-0 pt-14 text-base font-medium text-gray-600 z-20 hidden group-hover:block">
              <div className="min-w-48 bg-stone-100 rounded flex flex-col gap-4 p-4">
                <p
                  onClick={() => navigate("/my-profile")}
                  className="hover:text-black cursor-pointer"
                >
                  My Profile
                </p>
                <p
                  onClick={() => navigate("/my-appointments")}
                  className="hover:text-black cursor-pointer"
                >
                  My Appointments
                </p>
                <p onClick={logout} className="hover:text-black cursor-pointer">
                  Logout
                </p>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => navigate("/login")}
            className="bg-primary text-white px-8 py-3 rounded-full font-light hidden md:block cursor-pointer hover:bg-primary/90 transition-colors"
          >
            Create account
          </button>
        )}

        {/* Mobile menu button */}
        <img
          onClick={() => setShowMenu(true)}
          className="w-6 md:hidden cursor-pointer"
          src={assets.menu_icon}
          alt="Menu icon"
        />

        {/* Mobile Menu */}
        <div
          className={`${
            showMenu ? "fixed inset-0" : "hidden"
          } md:hidden z-20 bg-white transition-all`}
        >
          <div className="flex items-center justify-between px-5 py-6 border-b">
            <img className="w-36" src={assets.logo} alt="Website logo" />
            <img
              className="w-7 cursor-pointer"
              onClick={() => setShowMenu(false)}
              src={assets.cross_icon}
              alt="Close menu"
            />
          </div>
          <ul className="flex flex-col items-center gap-2 mt-5 px-5 text-lg font-medium">
            {navItems.map((item) => (
              <li key={item.path} className="w-full">
                <NavLink
                  to={item.path}
                  onClick={() => setShowMenu(false)}
                  className={({ isActive }) =>
                    `relative px-4 py-3 rounded-lg inline-block w-full text-center ${
                      isActive ? "text-primary bg-blue-50" : ""
                    }`
                  }
                >
                  {item.label}
                  {/* Blue line for mobile - different styling */}
                  {({ isActive }) =>
                    isActive && (
                      <span className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1/3 h-0.5 bg-primary rounded-full" />
                    )
                  }
                </NavLink>
              </li>
            ))}

            {/* Mobile login button */}
            {!token && (
              <li className="w-full mt-4">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    navigate("/login");
                  }}
                  className="bg-primary text-white px-8 py-3 rounded-full font-light w-full cursor-pointer hover:bg-primary/90 transition-colors"
                >
                  Create account
                </button>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
