// backend/config/gridfs.js
// ESM / Node module — no `require` usage
import fs from "fs";
import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";
import path from "path";

/**
 * Helper to get the GridFSBucket instance once mongoose is connected.
 * Waits for connection if not yet open.
 */
let _bucket = null;

async function getBucket() {
  if (_bucket) return _bucket;

  // wait for mongoose to be connected
  if (!mongoose.connection || !mongoose.connection.db) {
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        mongoose.connection.off("error", onError);
        resolve();
      };
      const onError = (err) => {
        mongoose.connection.off("open", onOpen);
        reject(err);
      };
      mongoose.connection.once("open", onOpen);
      mongoose.connection.once("error", onError);
    });
  }

  const db = mongoose.connection.db;
  _bucket = new GridFSBucket(db, { bucketName: "uploads" });
  return _bucket;
}

/**
 * Save a local file (provided by multer) to GridFS.
 * - filePath: full path on disk (temp file created by multer)
 * - originalName: original file name
 * - mimetype: content type
 * - metadata: object stored with file
 *
 * Returns { fileId, filename, length, contentType, streamUrl }
 * streamUrl = `/api/files/<fileId>` (relative) — you can prefix with BACKEND_URL if desired
 */
export async function saveFileToGridFS(
  filePath,
  originalName,
  mimetype,
  metadata = {}
) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("File not found: " + filePath);
  }

  const bucket = await getBucket();

  return await new Promise((resolve, reject) => {
    const filename = originalName || path.basename(filePath);
    const options = {
      contentType: mimetype || undefined,
      metadata: metadata || {},
    };

    const readStream = fs.createReadStream(filePath);
    const uploadStream = bucket.openUploadStream(filename, options);

    readStream
      .pipe(uploadStream)
      .on("error", async (err) => {
        // try cleanup temp file, then reject
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
        reject(err);
      })
      .on("finish", async () => {
        // GridFSBucketWriteStream 'finish' does NOT receive the file doc.
        // Use uploadStream.id (ObjectId) to look up the document if desired.
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.warn("Failed to remove temp file:", e?.message || e);
        }

        try {
          const id = uploadStream.id; // ObjectId
          // read the file doc from the files collection to return metadata/length/etc.
          const filesColl = mongoose.connection.db.collection("uploads.files");
          const fileDoc = await filesColl
            .findOne({ _id: id })
            .catch(() => null);

          const fileId = id instanceof ObjectId ? String(id) : id;
          const streamUrl = `/api/files/${fileId}`;

          resolve({
            fileId,
            filename: fileDoc?.filename || filename,
            length: fileDoc?.length ?? undefined,
            contentType: fileDoc?.contentType ?? options.contentType,
            streamUrl,
          });
        } catch (err) {
          // If anything goes wrong reading the files collection, still resolve with minimal info
          try {
            const id = uploadStream.id;
            const fileId = id instanceof ObjectId ? String(id) : id;
            resolve({
              fileId,
              filename,
              length: undefined,
              contentType: options.contentType,
              streamUrl: `/api/files/${fileId}`,
            });
          } catch (finalErr) {
            reject(finalErr);
          }
        }
      });
  });
}

/**
 * Delete a stored GridFS file by id (optional utility).
 */
export async function deleteFileFromGridFS(fileId) {
  if (!fileId) return false;
  const bucket = await getBucket();
  try {
    // allow passing either ObjectId or string
    const idToDelete =
      fileId instanceof ObjectId ? fileId : new ObjectId(String(fileId));
    await bucket.delete(idToDelete);
    return true;
  } catch (err) {
    // file may not exist or deletion failed
    return false;
  }
}
