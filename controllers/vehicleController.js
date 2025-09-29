import express from "express";
import mongoose from "mongoose";
import Vehicle from "../models/Vehicle.js";
import { protect } from "../middleware/authMiddleware.js"; // auth middleware
import upload from "../middleware/uploadMiddleware.js"; // multer middleware

const router = express.Router();

/**
 * ✅ Add a new vehicle (Admin only)
 */
router.post("/", protect, upload.array("images"), async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }

    const data = {
      ...req.body,
      seats: req.body.seats ? Number(req.body.seats) : undefined,
      pricePerHour: req.body.pricePerHour ? Number(req.body.pricePerHour) : undefined,
      isAvailable:
        req.body.isAvailable !== undefined
          ? req.body.isAvailable === "true" || req.body.isAvailable === true
          : true,
      features: req.body.features
        ? Array.isArray(req.body.features)
          ? req.body.features
          : req.body.features.split(",")
        : [],
      location: req.body.location
        ? {
            address: req.body.location.address,
            coordinates: [
              Number(req.body.location.lng),
              Number(req.body.location.lat),
            ],
          }
        : undefined,
      images: req.files ? req.files.map((file) => `/uploads/${file.filename}`) : [],
    };

    const vehicle = await Vehicle.create(data);
    res.status(201).json(vehicle);
  } catch (err) {
    next(err);
  }
});

/**
 * ✅ Get all vehicles
 */
router.get("/", async (req, res, next) => {
  try {
    const vehicles = await Vehicle.find().lean();
    res.json(vehicles);
  } catch (err) {
    next(err);
  }
});

/**
 * ✅ Get single vehicle by ID
 */
router.get("/:id", async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid vehicle ID" });
  }

  try {
    const vehicle = await Vehicle.findById(id).lean();
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }
    res.json(vehicle);
  } catch (err) {
    next(err);
  }
});

/**
 * ✅ Update vehicle by ID (Admin only)
 */
router.put("/:id", protect, upload.array("images"), async (req, res, next) => {
  const { id } = req.params;

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid vehicle ID" });
  }

  try {
    const vehicle = await Vehicle.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();

    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    res.json(vehicle);
  } catch (err) {
    next(err);
  }
});

/**
 * ✅ Delete vehicle by ID (Admin only)
 */
router.delete("/:id", protect, async (req, res, next) => {
  const { id } = req.params;

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid vehicle ID" });
  }

  try {
    const vehicle = await Vehicle.findByIdAndDelete(id);
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }
    res.json({ message: "Vehicle deleted successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
