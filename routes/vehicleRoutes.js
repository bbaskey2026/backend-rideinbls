import express from "express";
import { body, param, query, validationResult } from "express-validator";
import mongoose from "mongoose";
import Vehicle from "../models/Vehicle.js";
import axios from "axios";
import Booking from "../models/BookingPayment.js";
import { authMiddleware } from "../middleware/auth.js";
import multer from "multer";

const router = express.Router();
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ----------------------
// Validation helper
// ----------------------
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// GET /api/vehicles/my-bookings?page=1&limit=10




import BookingPayment from "../models/BookingPayment.js"; // Use correct model

router.get("/my-bookings", authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Count total paid bookings
    const total = await Booking.countDocuments({
      user: req.user._id,
      paymentStatus: "Paid", // Only show paid bookings
    });

    // Fetch paginated bookings
    const bookings = await Booking.find({
      user: req.user._id,
      paymentStatus: "Paid",
    })
      .populate(
        "vehicle",
        "name brand type seats licensePlate images pricePerKM pricePerHour"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Format to ensure UI doesn’t break
    const formattedBookings = bookings.map((b) => ({
      ...b.toObject(),
      vehicle: b.vehicle
        ? {
            ...b.vehicle.toObject(),
            brand: b.vehicle.brand || "N/A",
            type: b.vehicle.type || "N/A",
            seats: b.vehicle.seats || "N/A",
            licensePlate: b.vehicle.licensePlate || "N/A",
            pricePerKM: b.vehicle.pricePerKM || 0,
            pricePerHour: b.vehicle.pricePerHour || 0,
          }
        : null,
    }));

    console.log(formattedBookings);
console.log(bookings.paymentStatus);
    res.status(200).json({
      success: true,
      data: formattedBookings,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Fetch my bookings error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: err.message,
    });
  }
});



router.get("/debug-bookings", authMiddleware, async (req, res) => {
  try {
    const allBookings = await Booking.find({ user: req.user._id })
      .populate("vehicle")
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: allBookings.length,
      bookings: allBookings,
      userIdFromToken: req.user._id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// GET /api/vehicles - list all vehicles with filters
// ----------------------

router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("type").optional().isString(),
    query("available").optional().isBoolean().toBoolean(),
    query("minPrice").optional().isFloat({ min: 0 }).toFloat(),
    query("maxPrice").optional().isFloat({ min: 0 }).toFloat(),
    query("search").optional().isString().trim().escape(),
  ],
  validate,
  async (req, res) => {
    try {
      const { page = 1, limit = 30, type, available, minPrice, maxPrice, search, sortBy = "createdAt", sortOrder = "desc" } = req.query;

      const filter = {};
      if (type) filter.type = type;
      if (typeof available === "boolean") filter.available = available;
      else filter.available = true;

      if (minPrice || maxPrice) {
        filter.pricePerKM = {};
        if (minPrice) filter.pricePerKM.$gte = minPrice;
        if (maxPrice) filter.pricePerKM.$lte = maxPrice;
      }

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { brand: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

      const [items, total] = await Promise.all([
        Vehicle.find(filter).sort(sort).skip(skip).limit(limit).lean(),
        Vehicle.countDocuments(filter),
      ]);

      res.json({
        data: items,
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error("GET /api/vehicles error:", err);
      res.status(500).json({ error: "Failed to fetch vehicles" });
    }
  }
);




// ----------------------
// POST /api/vehicles - create vehicle
// ----------------------

// ----------------------
// PUT /api/vehicles/:id - update vehicle
// ----------------------
const upload = multer({ storage: multer.memoryStorage() });
router.post(
  "/",
  upload.array("images"), // handle multiple file uploads
  [
    body("name").isString().trim().notEmpty(),
    body("brand").isString().trim().notEmpty(),
    body("type").isIn(["Sedan", "SUV", "Bike", "Convertible", "Truck", "Van", "Coupe", "Wagon", "Other"]),
    body("seats").optional().isInt({ min: 1 }),
    body("pricePerKM").optional().isFloat({ min: 0 }),
    body("pricePerHour").optional().isFloat({ min: 0 }),
    body("available").optional().isBoolean(),
    body("features").optional().isArray(),
    body("licensePlate").optional().isString().trim(),
    body("baseLocation").optional().isString().trim(),
    body("mileage").optional().isFloat({ min: 0 }),
    body("description").optional().isString().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const payload = { ...req.body };

      // Convert numeric and boolean fields
      if (payload.seats) payload.seats = parseInt(payload.seats);
      if (payload.pricePerKM) payload.pricePerKM = parseFloat(payload.pricePerKM);
      if (payload.pricePerHour) payload.pricePerHour = parseFloat(payload.pricePerHour);
      if (payload.mileage) payload.mileage = parseFloat(payload.mileage);
      if (payload.available) payload.available = payload.available === "true" || payload.available === true;

      // Handle uploaded images
      if (req.files && req.files.length > 0) {
        payload.images = req.files.map((file) => `data:${file.mimetype};base64,${file.buffer.toString("base64")}`);
      }

      // Check for existing license plate
      if (payload.licensePlate) {
        const exists = await Vehicle.findOne({ licensePlate: payload.licensePlate });
        if (exists) return res.status(409).json({ error: "Vehicle with this license plate already exists" });
      }

      const vehicle = new Vehicle(payload);
      await vehicle.save();

      res.status(201).json(vehicle);
    } catch (err) {
      console.error("POST /api/vehicles error:", err);
      res.status(500).json({ error: "Failed to create vehicle" });
    }
  }
);

// ----------------------
// GET /api/vehicles/:id - fetch single vehicle
// ----------------------
router.get(
  "/:id",
  [param("id").custom((v) => isValidObjectId(v)).withMessage("Invalid vehicle id")],
  validate,
  async (req, res) => {
    try {
      const { id } = req.params;
      const vehicle = await Vehicle.findById(id).lean();
      if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
      res.json(vehicle);
    } catch (err) {
      console.error("GET /api/vehicles/:id error:", err);
      res.status(500).json({ error: "Failed to fetch vehicle" });
    }
  }
);


router.put(
  "/:id",
  [
    param("id").custom((v) => isValidObjectId(v)).withMessage("Invalid vehicle id"),
    body("name").optional().isString().trim(),
    body("brand").optional().isString().trim(),
    body("type").optional().isIn(["Sedan", "SUV", "Bike", "Convertible", "Truck", "Van", "Coupe", "Wagon", "Other"]),
    body("seats").optional().isInt({ min: 1 }),
    body("pricePerKM").optional().isFloat({ min: 0 }),
    body("pricePerHour").optional().isFloat({ min: 0 }),
    body("available").optional().isBoolean(),
    body("images").optional().isArray(),
    body("features").optional().isArray(),
    body("licensePlate").optional().isString().trim(),
    body("baseLocation").optional().isString().trim(),
    body("mileage").optional().isFloat({ min: 0 }),
    body("description").optional().isString().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      if (updates.licensePlate) {
        const exists = await Vehicle.findOne({ licensePlate: updates.licensePlate, _id: { $ne: id } });
        if (exists) return res.status(409).json({ error: "Another vehicle with this license plate exists" });
      }
      const vehicle = await Vehicle.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
      if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
      res.json(vehicle);
    } catch (err) {
      console.error("PUT /api/vehicles/:id error:", err);
      res.status(500).json({ error: "Failed to update vehicle" });
    }
  }
);

// ----------------------
// DELETE /api/vehicles/:id
// ----------------------
router.delete(
  "/:id",
  [param("id").custom((v) => isValidObjectId(v)).withMessage("Invalid vehicle id")],
  validate,
  async (req, res) => {
    try {
      const { id } = req.params;
      const vehicle = await Vehicle.findByIdAndDelete(id);
      if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
      res.json({ message: "Vehicle deleted successfully" });
    } catch (err) {
      console.error("DELETE /api/vehicles/:id error:", err);
      res.status(500).json({ error: "Failed to delete vehicle" });
    }
  }
);

export default router;
