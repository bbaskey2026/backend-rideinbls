import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import Post from "./models/Post.js";

dotenv.config();
const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log("MongoDB connected"))
.catch(err => console.error(err));

// Multer (memory, max 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// POST /posts
app.post("/posts", upload.any(), async (req, res) => {
  try {
    const { title, fields } = req.body;
    if (!title || !fields) return res.status(400).json({ message: "Title and fields required" });

    let parsedFields;
    try { parsedFields = JSON.parse(fields); } 
    catch { return res.status(400).json({ message: "Invalid fields format" }); }

    // Attach uploaded files
    req.files.forEach(file => {
      const index = parsedFields.findIndex(f => f.name === file.fieldname);
      if (index !== -1) parsedFields[index].value = { data: file.buffer, contentType: file.mimetype };
    });

    const newPost = new Post({ title, fields: parsedFields });
    await newPost.save();
    res.status(201).json({ message: "Post created", id: newPost._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /posts (all)
app.get("/posts", async (req, res) => {
  const posts = await Post.find({}, "_id title createdAt").sort({ createdAt: -1 });
  res.json(posts);
});

// GET /posts/:id (single, with base64 images)
app.get("/posts/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Convert image buffer to base64 for all image fields
    const fieldsWithBase64 = post.fields.map(f => {
      if (f.type === "image" && f.value?.data) {
        return { ...f, value: `data:${f.value.contentType};base64,${f.value.data.toString("base64")}` };
      }
      // For other types, just return value as-is
      return f;
    });

    res.json({ ...post._doc, fields: fieldsWithBase64 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
