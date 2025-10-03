import express from "express";
import mongoose from "mongoose";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Driver Schema
const driverSchema = new mongoose.Schema(
  {
    // Personal Information
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    mobile: {
      type: String,
      required: [true, "Mobile number is required"],
      unique: true,
      trim: true,
      match: /^[0-9]{10}$/,
    },
    dateOfBirth: {
      type: Date,
      required: [true, "Date of birth is required"],
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true, match: /^[0-9]{6}$/ },
    },

    // License Information
    licenseNumber: {
      type: String,
      required: [true, "License number is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    licenseType: {
      type: String,
      required: [true, "License type is required"],
      enum: ["Light Motor Vehicle", "Heavy Motor Vehicle", "Commercial"],
    },
    licenseExpiry: {
      type: Date,
      required: [true, "License expiry date is required"],
    },
    licenseIssueDate: {
      type: Date,
      required: [true, "License issue date is required"],
    },

    // Documents
    documents: {
      photo: { type: String }, // URL or file path
      licenseImage: { type: String },
      aadharImage: { type: String },
      panImage: { type: String },
    },

    // Employment Details
    joinDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "On Leave", "Suspended"],
      default: "Active",
      index: true,
    },
    assignedVehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },

    // Experience & Rating
    yearsOfExperience: {
      type: Number,
      default: 0,
      min: 0,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalTrips: {
      type: Number,
      default: 0,
    },

    // Emergency Contact
    emergencyContact: {
      name: { type: String, trim: true },
      relation: { type: String, trim: true },
      mobile: { type: String, trim: true, match: /^[0-9]{10}$/ },
    },

    // Additional Info
    notes: { type: String },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

// Indexes
driverSchema.index({ email: 1 });
driverSchema.index({ mobile: 1 });
driverSchema.index({ licenseNumber: 1 });
driverSchema.index({ status: 1 });

const Driver = mongoose.model("Driver", driverSchema);

// Helper function for responses
const sendResponse = (res, statusCode, success, message, data = null) => {
  return res.status(statusCode).json({
    success,
    message,
    ...(data && { data }),
  });
};

// CREATE DRIVER - Admin only
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      name,
      email,
      mobile,
      dateOfBirth,
      address,
      licenseNumber,
      licenseType,
      licenseExpiry,
      licenseIssueDate,
      yearsOfExperience,
      emergencyContact,
      notes,
    } = req.body;

    // Validate required fields
    if (!name || !email || !mobile || !dateOfBirth || !licenseNumber || !licenseType || !licenseExpiry || !licenseIssueDate) {
      return sendResponse(res, 400, false, "Missing required fields");
    }

    // Check if driver already exists
    const existingDriver = await Driver.findOne({
      $or: [{ email }, { mobile }, { licenseNumber }],
    });

    if (existingDriver) {
      return sendResponse(res, 409, false, "Driver with this email, mobile, or license number already exists");
    }

    // Validate license expiry (should be in future)
    if (new Date(licenseExpiry) < new Date()) {
      return sendResponse(res, 400, false, "License has expired");
    }

    // Create new driver
    const driver = new Driver({
      name,
      email,
      mobile,
      dateOfBirth,
      address,
      licenseNumber: licenseNumber.toUpperCase(),
      licenseType,
      licenseExpiry,
      licenseIssueDate,
      yearsOfExperience: yearsOfExperience || 0,
      emergencyContact,
      notes,
      createdBy: req.user._id,
    });

    await driver.save();

    return sendResponse(res, 201, true, "Driver created successfully", { driver });
  } catch (err) {
    console.error("Create driver error:", err);
    if (err.name === "ValidationError") {
      return sendResponse(res, 400, false, err.message);
    }
    return sendResponse(res, 500, false, "Failed to create driver");
  }
});

// GET ALL DRIVERS - Admin only
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    
    const query = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Search by name, email, or mobile
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { licenseNumber: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const drivers = await Driver.find(query)
      .populate("assignedVehicle", "name brand licensePlate")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Driver.countDocuments(query);

    return sendResponse(res, 200, true, "Drivers retrieved successfully", {
      drivers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get drivers error:", err);
    return sendResponse(res, 500, false, "Failed to retrieve drivers");
  }
});

// GET SINGLE DRIVER - Admin only
router.get("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id)
      .populate("assignedVehicle", "name brand licensePlate type")
      .populate("createdBy", "name email")
      .lean();

    if (!driver) {
      return sendResponse(res, 404, false, "Driver not found");
    }

    return sendResponse(res, 200, true, "Driver retrieved successfully", { driver });
  } catch (err) {
    console.error("Get driver error:", err);
    return sendResponse(res, 500, false, "Failed to retrieve driver");
  }
});

// UPDATE DRIVER - Admin only
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const updates = req.body;
    
    // Don't allow updating these fields directly
    delete updates._id;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.totalTrips;
    delete updates.rating;

    // Validate license expiry if updating
    if (updates.licenseExpiry && new Date(updates.licenseExpiry) < new Date()) {
      return sendResponse(res, 400, false, "License expiry date cannot be in the past");
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("assignedVehicle", "name brand licensePlate");

    if (!driver) {
      return sendResponse(res, 404, false, "Driver not found");
    }

    return sendResponse(res, 200, true, "Driver updated successfully", { driver });
  } catch (err) {
    console.error("Update driver error:", err);
    if (err.name === "ValidationError") {
      return sendResponse(res, 400, false, err.message);
    }
    return sendResponse(res, 500, false, "Failed to update driver");
  }
});

// DELETE DRIVER - Admin only
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const driver = await Driver.findByIdAndDelete(req.params.id);

    if (!driver) {
      return sendResponse(res, 404, false, "Driver not found");
    }

    return sendResponse(res, 200, true, "Driver deleted successfully");
  } catch (err) {
    console.error("Delete driver error:", err);
    return sendResponse(res, 500, false, "Failed to delete driver");
  }
});

// ASSIGN VEHICLE TO DRIVER - Admin only
router.post("/:id/assign-vehicle", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { vehicleId } = req.body;

    if (!vehicleId) {
      return sendResponse(res, 400, false, "Vehicle ID is required");
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { assignedVehicle: vehicleId },
      { new: true }
    ).populate("assignedVehicle", "name brand licensePlate");

    if (!driver) {
      return sendResponse(res, 404, false, "Driver not found");
    }

    return sendResponse(res, 200, true, "Vehicle assigned successfully", { driver });
  } catch (err) {
    console.error("Assign vehicle error:", err);
    return sendResponse(res, 500, false, "Failed to assign vehicle");
  }
});

export default router;