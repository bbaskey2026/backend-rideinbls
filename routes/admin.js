import express from "express";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import Booking from "../models/BookingPayment.js";
import multer from 'multer';
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/* =========================================================
   SIMPLE DATABASE STORAGE CONFIGURATION
========================================================= */

// Memory storage for processing images
const memoryStorage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedMimes.join(', ')}`), false);
  }
};

// Configure multer with memory storage
const upload = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 5, // Maximum 5 images per vehicle
  },
});

/* =========================================================
   IMAGE PROCESSING FUNCTIONS - SIMPLIFIED
========================================================= */

// Helper function to process uploaded images - store as base64 in database
const processUploadedImages = async (files) => {
  if (!files || files.length === 0) {
    return [];
  }

  console.log(`Processing ${files.length} uploaded images for database storage...`);

  // Convert files to base64 for database storage
  return files.map(file => ({
    data: file.buffer.toString('base64'),
    contentType: file.mimetype,
    originalName: file.originalname,
    size: file.size,
    filename: `vehicle-${Date.now()}-${Math.round(Math.random() * 1E9)}.${file.originalname.split('.').pop()}`,
    uploadedAt: new Date()
  }));
};

// Helper function to get image URL for frontend
const getImageUrl = (image, req) => {
  if (!image) return null;

  // For GridFS stored as string
  if (typeof image === 'string' && mongoose.Types.ObjectId.isValid(image)) {
    return `${req.protocol}://${req.get('host')}/api/images/${image}`;
  }

  // Cloudinary or other legacy logic
  if (image.url) return image.url;
  return null;
};


/* =========================================================
   USER MANAGEMENT
========================================================= */

// Get all users (including _id and excluding password)
router.get("/users", authMiddleware, async (req, res) => {
  try {
    const users = await User.find({}).select("-password");

    const usersWithBookingCount = await Promise.all(
      users.map(async (user) => {
        const bookingCount = await Booking.countDocuments({ user: user._id });
        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          bookingsCount: bookingCount,
          avatar: user.avatar || user.profilePicture || null
        };
      })
    );

    res.json({ success: true, users: usersWithBookingCount });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch users",
      details: err.message,
    });
  }
});

// Get single user
router.get("/users/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    const bookingCount = await Booking.countDocuments({ user: user._id });

    const userWithBookingCount = {
      ...user.toObject(),
      bookingsCount: bookingCount
    };

    res.json(userWithBookingCount);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch user",
      details: err.message,
    });
  }
});

// Block User
router.patch("/users/:id/block", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: "User blocked successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isActive: user.isActive
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to block user",
      details: err.message,
    });
  }
});

// Unblock User
router.patch("/users/:id/unblock", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isActive = true;
    await user.save();

    res.json({
      success: true,
      message: "User unblocked successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isActive: user.isActive
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to unblock user",
      details: err.message,
    });
  }
});

// Delete User
router.delete("/users/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const activeBookings = await Booking.countDocuments({
      user: req.params.id,
      status: { $in: ['Pending', 'Confirmed'] }
    });

    if (activeBookings > 0) {
      return res.status(400).json({
        error: "Cannot delete user with active bookings",
        details: `User has ${activeBookings} active booking(s)`
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to delete user",
      details: err.message,
    });
  }
});

// Update User
router.put("/users/:id", authMiddleware, async (req, res) => {
  try {
    const { name, email, phone, role } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, phone, role, updatedAt: new Date() },
      { new: true }
    ).select("-password");

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      success: true,
      message: "User updated successfully",
      user
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to update user",
      details: err.message,
    });
  }
});

/* =========================================================
   VEHICLE MANAGEMENT - SIMPLIFIED DATABASE STORAGE
========================================================= */

// Get all vehicles with booking counts
router.get("/vehicles", async (req, res) => {
  try {
    const vehicles = await Vehicle.find();

    const vehiclesWithBookingData = await Promise.all(
      vehicles.map(async (vehicle) => {
        // Count total bookings for this vehicle
        const bookingCount = await Booking.countDocuments({ vehicle: vehicle._id });

        // Count only active bookings
        const activeBookings = await Booking.countDocuments({
          vehicle: vehicle._id,
          status: { $in: ["Pending", "Confirmed", "Completed"] },
        });

        // Get the latest booking for payment status
        const latestBooking = await Booking.findOne({ vehicle: vehicle._id })
          .sort({ createdAt: -1 }) // latest booking
          .select("paymentStatus status payment.provider payment.amount payment.currency");

        // Process images for frontend consumption
        const processedImages = vehicle.images
          ? vehicle.images.map((image) => getImageUrl(image)).filter((url) => url)
          : [];

        return {
          _id: vehicle._id,
          name: vehicle.name,
          brand: vehicle.brand,
          type: vehicle.type,
          licensePlate: vehicle.licensePlate,
          capacity: vehicle.capacity,
          pricePerHour: vehicle.pricePerHour,
          pricePerKM: vehicle.pricePerKM,
          isAvailable: vehicle.isAvailable,
          location: vehicle.location,
          images: processedImages,
          features: vehicle.features,
          fuelType: vehicle.fuelType,
          transmission: vehicle.transmission,
          year: vehicle.year,
          color: vehicle.color,
          createdAt: vehicle.createdAt,
          updatedAt: vehicle.updatedAt,

          // Booking stats
          bookingsCount: bookingCount,
          activeBookings,

          // Latest payment + booking info
          lastPaymentStatus: latestBooking ? latestBooking.paymentStatus : "No Bookings",
          lastBookingStatus: latestBooking ? latestBooking.status : "No Bookings",
          lastPaymentInfo: latestBooking
            ? {
                provider: latestBooking.payment?.provider || null,
                amount: latestBooking.payment?.amount || null,
                currency: latestBooking.payment?.currency || null,
              }
            : null,
        };
      })
    );

    res.json({
      success: true,
      vehicles: vehiclesWithBookingData,
      storageType: "database",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch vehicles",
      details: err.message,
    });
  }
});

// Get single vehicle
router.get("/vehicles/:id", authMiddleware, async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const bookingCount = await Booking.countDocuments({ vehicle: vehicle._id });
    const activeBookings = await Booking.countDocuments({
      vehicle: vehicle._id,
      status: { $in: ['Pending', 'Confirmed'] }
    });

    // Process images for frontend consumption
    const processedImages = vehicle.images ?
      vehicle.images.map(image => getImageUrl(image)).filter(url => url) : [];

    const vehicleWithBookingCount = {
      ...vehicle.toObject(),
      images: processedImages,
      bookingsCount: bookingCount,
      activeBookings: activeBookings
    };

    res.json(vehicleWithBookingCount);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch vehicle",
      details: err.message,
    });
  }
});

// Create Vehicle with Database Storage
router.post("/vehicles", upload.array('images', 5), async (req, res) => {
  try {
    console.log(`Creating vehicle with ${req.files?.length || 0} images`);
    console.log('Vehicle data:', req.body);

    // Process uploaded images
    const processedImages = await processUploadedImages(req.files);
    console.log(`Processed ${processedImages.length} images for database storage`);

    // Parse features
    let features = [];
    if (req.body.features) {
      features = typeof req.body.features === 'string'
        ? req.body.features.split(',').map(f => f.trim()).filter(f => f)
        : req.body.features;
    }

    // Create vehicle data object
    const vehicleData = {
      name: req.body.name?.trim(),
      brand: req.body.brand?.trim(),
      type: req.body.type?.trim(),
      licensePlate: req.body.licensePlate?.trim().toUpperCase(),
      capacity: parseInt(req.body.capacity) || 0,
      pricePerHour: parseFloat(req.body.pricePerHour) || 0,
      pricePerKM: parseFloat(req.body.pricePerKM) || 0,
      location: req.body.location?.trim(),
      baseLocation: req.body.baseLocation?.trim(),
      fuelType: req.body.fuelType?.trim(),
      transmission: req.body.transmission?.trim(),
      year: parseInt(req.body.year) || new Date().getFullYear(),
      color: req.body.color?.trim(),
      features,
      images: processedImages,
      isAvailable: req.body.isAvailable === 'true' || req.body.isAvailable === true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // ---------------------- VALIDATION ----------------------
    const errors = [];

    if (!vehicleData.name) errors.push("Vehicle name is required");
    if (!vehicleData.brand) errors.push("Brand is required");
    if (!vehicleData.type) errors.push("Type is required");
    if (!vehicleData.licensePlate) errors.push("License plate is required");
    if (!vehicleData.pricePerKM || vehicleData.pricePerKM <= 0) {
      errors.push("Price per KM must be greater than 0");
    }
    if (!vehicleData.pricePerHour || vehicleData.pricePerHour<= 0) {
      errors.push("Price per Hour must be greater than 0");
    }

    // License plate regex (Indian RTO format e.g., KA01AB1234)
    const licenseRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{1,4}$/;
    if (vehicleData.licensePlate && !licenseRegex.test(vehicleData.licensePlate)) {
      errors.push("Invalid license plate format (expected: KA01AB1234)");
    }

    // Year validation
    if (vehicleData.year < 1980 || vehicleData.year > new Date().getFullYear()) {
      errors.push("Invalid manufacturing year");
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors
      });
    }

    // ---------------------- DUPLICATE LICENSE CHECK ----------------------
    const existingVehicle = await Vehicle.findOne({ licensePlate: vehicleData.licensePlate });
    if (existingVehicle) {
      return res.status(400).json({
        success: false,
        error: "Duplicate license plate",
        details: "This license plate is already registered."
      });
    }

    // ---------------------- SAVE VEHICLE ----------------------
    const vehicle = new Vehicle(vehicleData);
    await vehicle.save();

    res.json({
      success: true,
      message: `Vehicle added successfully with ${processedImages.length} images`,
      vehicle,
      storageType: 'database'
    });
  } catch (err) {
    console.error('Error creating vehicle:', err);

    res.status(500).json({
      success: false,
      error: "Failed to add vehicle",
      details: err.message,
    });
  }
});


// Update Vehicle with Database Storage
router.put("/vehicles/:id", authMiddleware, upload.array('images', 5), async (req, res) => {
  try {
    const existingVehicle = await Vehicle.findById(req.params.id);
    if (!existingVehicle) {
      return res.status(404).json({
        success: false,
        error: "Vehicle not found"
      });
    }

    console.log(`Updating vehicle ${req.params.id} with ${req.files?.length || 0} new images`);

    // Handle new image uploads
    const newProcessedImages = await processUploadedImages(req.files);
    console.log(`Processed ${newProcessedImages.length} new images`);

    // Keep existing images and add new ones
    let allImages = [...(existingVehicle.images || [])];

    if (newProcessedImages.length > 0) {
      allImages = [...allImages, ...newProcessedImages];
    }

    // Handle image removal
    if (req.body.imagesToRemove) {
      try {
        const imagesToRemove = JSON.parse(req.body.imagesToRemove);
        console.log(`Removing ${imagesToRemove.length} images`);

        // Filter out images to remove (base64 comparison)
        allImages = allImages.filter(img => {
          const imageUrl = getImageUrl(img);
          return !imagesToRemove.includes(imageUrl);
        });

        console.log(`Remaining images: ${allImages.length}`);
      } catch (parseError) {
        console.error('Error parsing imagesToRemove:', parseError);
      }
    }

    // Parse features
    let features = existingVehicle.features;
    if (req.body.features !== undefined) {
      features = typeof req.body.features === 'string'
        ? req.body.features.split(',').map(f => f.trim()).filter(f => f)
        : req.body.features;
    }

    // Update vehicle data
    const updateData = {
      name: req.body.name?.trim() || existingVehicle.name,
      brand: req.body.brand?.trim() || existingVehicle.brand,
      type: req.body.type?.trim() || existingVehicle.type,
      licensePlate: req.body.licensePlate?.trim().toUpperCase() || existingVehicle.licensePlate,
      capacity: req.body.capacity ? parseInt(req.body.capacity) : existingVehicle.capacity,
      pricePerHour: req.body.pricePerHour ? parseFloat(req.body.pricePerHour) : existingVehicle.pricePerHour,
            pricePerKM: req.body.pricePerKM ? parseFloat(req.body.pricePerKM) : existingVehicle.pricePerKM,
      baseLocation: req.body.location?.trim() || existingVehicle.location,
      fuelType: req.body.fuelType?.trim() || existingVehicle.fuelType,
      transmission: req.body.transmission?.trim() || existingVehicle.transmission,
      year: req.body.year ? parseInt(req.body.year) : existingVehicle.year,
      color: req.body.color?.trim() || existingVehicle.color,
      features: features,
      images: allImages,
      isAvailable: req.body.isAvailable !== undefined ?
        (req.body.isAvailable === 'true' || req.body.isAvailable === true) :
        existingVehicle.isAvailable,
      updatedAt: new Date()
    };

    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, updateData, { new: true });

    res.json({
      success: true,
      message: "Vehicle updated successfully",
      vehicle
    });
  } catch (err) {
    console.error('Error updating vehicle:', err);
    res.status(500).json({
      success: false,
      error: "Failed to update vehicle",
      details: err.message,
    });
  }
});

// Delete single image from vehicle
router.delete("/vehicles/:id/images", authMiddleware, async (req, res) => {
  try {
    const { imageUrl } = req.body;

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: "Vehicle not found"
      });
    }

    // Remove image from array by comparing base64 data
    const originalCount = vehicle.images.length;
    vehicle.images = vehicle.images.filter(img => {
      const imgUrl = getImageUrl(img);
      return imgUrl !== imageUrl;
    });

    if (vehicle.images.length < originalCount) {
      await vehicle.save();
      console.log('Single image deleted successfully');
    }

    res.json({
      success: true,
      message: "Image deleted successfully",
      vehicle
    });
  } catch (err) {
    console.error('Error deleting image:', err);
    res.status(500).json({
      success: false,
      error: "Failed to delete image",
      details: err.message,
    });
  }
});

// Delete Vehicle
router.delete("/vehicles/:id", authMiddleware, async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({
      success: false,
      error: "Vehicle not found"
    });

    // Check for active bookings
    const activeBookings = await Booking.countDocuments({
      vehicle: req.params.id,
      status: { $in: ['Pending', 'Confirmed'] }
    });

    if (activeBookings > 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete vehicle with active bookings",
        details: `Vehicle has ${activeBookings} active booking(s)`
      });
    }

    // Delete vehicle from database (images are automatically deleted as they're stored in the document)
    await Vehicle.findByIdAndDelete(req.params.id);
    console.log(`Vehicle ${vehicle.name} and its images deleted successfully`);

    res.json({
      success: true,
      message: "Vehicle deleted successfully"
    });
  } catch (err) {
    console.error('Error deleting vehicle:', err);
    res.status(500).json({
      success: false,
      error: "Failed to delete vehicle",
      details: err.message,
    });
  }
});

// Toggle Vehicle Availability
router.patch("/vehicles/:id/toggle-availability", authMiddleware, async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({
      success: false,
      error: "Vehicle not found"
    });

    vehicle.isAvailable = !vehicle.isAvailable;
    vehicle.updatedAt = new Date();
    await vehicle.save();

    res.json({
      success: true,
      message: `Vehicle ${vehicle.isAvailable ? "made available" : "made unavailable"} successfully`,
      vehicle: {
        _id: vehicle._id,
        name: vehicle.name,
        licensePlate: vehicle.licensePlate,
        isAvailable: vehicle.isAvailable
      }
    });
  } catch (err) {
    console.error('Error toggling vehicle availability:', err);
    res.status(500).json({
      success: false,
      error: "Failed to toggle vehicle availability",
      details: err.message,
    });
  }
});

/* =========================================================
   BOOKING MANAGEMENT
========================================================= */

// Get all bookings
router.get("/bookings", authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("user", "name email")
      .populate("vehicle", "name brand type licensePlate");

    res.json({
      success: true,
      bookings: bookings
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch bookings",
      details: err.message,
    });
  }
});

// Update booking status
router.put("/bookings/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!booking) return res.status(404).json({
      success: false,
      error: "Booking not found"
    });

    res.json({
      success: true,
      message: "Booking status updated",
      booking
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to update booking",
      details: err.message,
    });
  }
});

/* =========================================================
   PAYMENTS MANAGEMENT
========================================================= */

// Get all payments
router.get("/payments", authMiddleware, async (req, res) => {
  try {
    const payments = await Booking.find()
      .populate("user", "name email")
      .populate("vehicle", "name brand type licensePlate")
      .select("payment.totalPrice payment.amount payment.status bookingCode createdAt");

    // Simplify response to only return amount + user + vehicle
    const formatted = payments.map(p => ({
      bookingCode: p.bookingCode,
      amountPaid: p.payment?.amount || 0,
      paymentStatus: p.payment?.status,
      user: p.user,
      vehicle: p.vehicle,
      createdAt: p.createdAt
    }));

    res.json({
      success: true,
      payments: formatted
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch payments",
      details: err.message,
    });
  }
});

/* =========================================================
   SYSTEM INFORMATION
========================================================= */

// Get system information
router.get("/system/info", authMiddleware, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalVehicles = await Vehicle.countDocuments();
    const totalBookings = await Booking.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const availableVehicles = await Vehicle.countDocuments({ isAvailable: true });
    const pendingBookings = await Booking.countDocuments({ status: 'Pending' });

    res.json({
      success: true,
      system: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers
        },
        vehicles: {
          total: totalVehicles,
          available: availableVehicles,
          unavailable: totalVehicles - availableVehicles
        },
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          completed: totalBookings - pendingBookings
        },
        storage: {
          type: 'database',
          configured: true
        },
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch system information",
      details: err.message,
    });
  }
});

export default router;