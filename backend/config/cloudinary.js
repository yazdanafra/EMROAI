// backend/config/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

/**
 * Connect/configure Cloudinary using env vars.
 * Call this once at app startup (server.js).
 */
export default function connectCloudinary() {
  const CLOUD_NAME =
    process.env.CLOUDINARY_NAME || process.env.CLOUDINARY_CLOUD_NAME;
  const API_KEY = process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_KEY;
  // accept either CLOUDINARY_API_SECRET or CLOUDINARY_SECRET_KEY for compatibility
  const API_SECRET =
    process.env.CLOUDINARY_API_SECRET ||
    process.env.CLOUDINARY_SECRET_KEY ||
    process.env.CLOUDINARY_SECRET;

  // Log presence (not values) so you can see what's available
  console.info("Cloudinary env presence:", {
    cloud_name: !!CLOUD_NAME,
    api_key: !!API_KEY,
    api_secret: !!API_SECRET,
  });

  if (CLOUD_NAME && API_KEY && API_SECRET) {
    cloudinary.config({
      cloud_name: CLOUD_NAME,
      api_key: API_KEY,
      api_secret: API_SECRET,
    });
  } else {
    console.warn(
      "Cloudinary credentials are missing or incomplete. Uploads will fail until env vars are set correctly."
    );
  }

  return cloudinary;
}

/**
 * Upload a local file to Cloudinary and remove the temp file afterwards.
 * Returns the Cloudinary upload result object (promise).
 */
export const uploadToCloudinary = (filePath, options = {}) =>
  new Promise((resolve, reject) => {
    const opts = { resource_type: "auto", ...options }; // default to auto
    cloudinary.uploader.upload(filePath, opts, (err, result) => {
      // remove temp file (best-effort)
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        console.warn("Failed to remove temp file:", e?.message || e);
      }

      if (err) {
        // surface the exact error (so your terminal shows what's wrong)
        console.error("cloudinary upload error:", err?.message || err, {
          http_code: err?.http_code,
        });
        return reject(err);
      }
      resolve(result);
    });
  });
