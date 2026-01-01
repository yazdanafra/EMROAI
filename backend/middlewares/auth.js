// backend/middlewares/auth.js
import jwt from "jsonwebtoken";
import doctorModel from "../models/doctorModel.js";
import userModel from "../models/userModel.js";

/**
 * requireAuth - async middleware that decodes JWT and sets req.user = { id, role }.
 * If role is missing from token, attempts to infer role from DB (doctor -> "doctor", user -> "patient").
 */
export const requireAuth = async (req, res, next) => {
  try {
    if (req.user) return next();

    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: "Unauthorized" });

    const token = auth.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Normalize ID and role from common payload shapes
    const id = (
      payload.id ||
      payload._id ||
      payload.userId ||
      payload.sub ||
      ""
    ).toString();
    let role = (payload.role || payload.userRole || payload.type || "")
      .toString()
      .toLowerCase();

    req.user = { id, role: role || undefined };

    // If role is missing, try to infer from DB (backwards compatibility)
    if (!req.user.role) {
      try {
        const doc = await doctorModel
          .findById(req.user.id)
          .select("_id")
          .lean();
        if (doc) req.user.role = "doctor";
        else {
          const user = await userModel
            .findById(req.user.id)
            .select("_id")
            .lean();
          if (user) req.user.role = "patient";
        }
      } catch (e) {
        console.warn("role inference failed:", e?.message || e);
        // leave req.user.role undefined; role checks will fail later
      }
    }

    // DEBUG: remove in production if you want
    // console.log("[AUTH] req.user ->", req.user);

    return next();
  } catch (err) {
    console.error("requireAuth error:", err?.message || err);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

/**
 * requireRole(role) - middleware factory that ensures req.user.role === role OR req.user.role === 'admin'
 * Usage: router.post('/something', requireAuth, requireRole('doctor'), handler)
 */
export const requireRole = (role) => {
  const wanted = String(role).toLowerCase();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userRole = (req.user.role || "").toString().toLowerCase();
    if (userRole === wanted || userRole === "admin") return next();
    return res.status(403).json({ message: "Forbidden" });
  };
};
