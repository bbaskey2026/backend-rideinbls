// routes/imageRoutes.js
import express from "express";
import mongoose from "mongoose";

const { ObjectId } = mongoose.Types;
const router = express.Router();

let gfs;

// Wait until Mongo connection is open, then init GridFS
mongoose.connection.once("open", () => {
  gfs = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "uploads", // ✅ must match your GridFS bucket name
  });
});

// ✅ Fetch image by filename (declare BEFORE fileId route)
router.get("/filename/:name", async (req, res) => {
  try {
    const { name } = req.params;
    console.log("📂 Fetch request for filename:", name);

    const files = await gfs.find({ filename: name }).toArray();
    console.log("🔍 Found files:", files);

    if (!files || files.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    res.set("Content-Type", files[0].contentType);
    gfs.openDownloadStreamByName(name).pipe(res);
  } catch (err) {
    console.error("❌ Error in filename route:", err);
    res.status(500).json({ error: err.message });
  }
});


// ✅ Fetch image by fileId (must come AFTER filename route)
router.get("/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: "Invalid file ID" });
    }

    const _id = new ObjectId(fileId);

    const files = await gfs.find({ _id }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    res.set("Content-Type", files[0].contentType);
    gfs.openDownloadStream(_id).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
