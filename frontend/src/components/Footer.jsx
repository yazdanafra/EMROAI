import React from "react";
import { assets } from "../assets/assets";

const Footer = () => {
  return (
    <div className="md:mx-10">
      <div className="grid grid-cols-1 sm:grid-cols-[3fr_1fr_1fr] gap-14 my-10 mt-40 text-sm">
        {/* left */}
        <div>
          <img className="mb-5 w-40" src={assets.logo} alt="" />
          <p className="w-full md:w-2/3 text-gray-600 leading-6">
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Deleniti,
            tenetur dolorem? Aspernatur nesciunt voluptatum delectus, provident
            quam, accusantium fugiat, sint officiis unde architecto explicabo
            nobis consequatur quaerat similique ipsam pariatur?
          </p>
        </div>

        {/* center */}
        <div>
          <p className="text-xl font-medium mb-5">COMPANY</p>
          <ul className="flex flex-col gap-2 text-gray-600">
            <li>Home</li>
            <li>About Us</li>
            <li>Contact Us</li>
            <li>Privacy Policy</li>
          </ul>
        </div>

        {/* right */}
        <div>
          <p className="text-xl font-medium mb-5">GET in TOUCH</p>
          <ul className="flex flex-col gap-2 text-gray-600">
            <li>+98-31-9090-0000</li>
            <li>yazdan9093@gmail.com</li>
          </ul>
        </div>
      </div>
      {/* copyright text */}
      <div>
        <hr />
        <p className="py-5 text-sm text-center">
          Copyright 2026@ Ophix - ALL Rights Reserved.
        </p>
      </div>
    </div>
  );
};

export default Footer;
