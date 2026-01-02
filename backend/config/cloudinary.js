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
  const API_SECRET =
    process.env.CLOUDINARY_API_SECRET ||
    process.env.CLOUDINARY_SECRET_KEY ||
    process.env.CLOUDINARY_SECRET;

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
 * - options: passed to cloudinary.uploader.upload (we spread user options)
 * - timeoutMs: optional number to abort upload after N ms (default 60s)
 */
export const uploadToCloudinary = async (
  filePath,
  options = {},
  timeoutMs = 60000
) => {
  // build options correctly
  const opts = { resource_type: "auto", ...options };

  // helper to remove temp file (best-effort)
  const removeTemp = () => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.warn("Failed to remove temp file:", e?.message || e);
    }
  };

  // Cloudinary callback-based API can return promise if no callback is supplied.
  const uploadPromise = cloudinary.uploader.upload(filePath, opts);

  // Optional timeout wrapper
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Cloudinary upload timed out")),
      timeoutMs
    )
  );

  try {
    // race upload vs timeout
    const result = await Promise.race([uploadPromise, timeoutPromise]);
    return result;
  } catch (err) {
    // log examplar details for debugging (http_code often present)
    console.error("cloudinary upload error:", err?.message || err, {
      http_code: err?.http_code,
    });
    throw err;
  } finally {
    // always try to remove temp file
    removeTemp();
  }
};
