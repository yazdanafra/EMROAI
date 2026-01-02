// backend/routes/filesRoute.js
import express from "express";
import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";

const router = express.Router();

/**
 * GET /api/files/:id
 * Streams the file stored in GridFS to the client.
 * Sets Content-Type and Content-Disposition for downloads.
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).send("Missing file id");

  // ensure db ready
  if (!mongoose.connection || !mongoose.connection.db) {
    return res.status(500).send("DB not ready");
  }

  try {
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: "uploads" });
    const _id = new ObjectId(id);

    // find file document to read metadata / contentType
    const filesColl = db.collection("uploads.files");
    const fileDoc = await filesColl.findOne({ _id });
    if (!fileDoc) return res.status(404).send("Not found");

    // set headers
    const filename = fileDoc.filename || id;
    const contentType =
      fileDoc.contentType ||
      fileDoc.metadata?.contentType ||
      "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    // inline for images, download for others (you can tweak)
    const disposition = contentType.startsWith("image/")
      ? "inline"
      : "attachment";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${encodeURIComponent(filename)}"`
    );

    const downloadStream = bucket.openDownloadStream(_id);
    downloadStream.on("error", (err) => {
      console.error("GridFS download error:", err);
      if (!res.headersSent) res.status(500).send("Failed to stream file");
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error("filesRoute error:", err);
    return res.status(500).send("Server error");
  }
});

export default router;
