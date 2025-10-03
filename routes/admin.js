import express from "express";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import Booking from "../models/BookingPayment.js";
import multer from 'multer';
import { authMiddleware } from "../middleware/auth.js";
import mongoose from "mongoose";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   CONSTANTS & CONFIGURATION
========================================================= */

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 5;
const LICENSE_PLATE_REGEX = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{1,4}$/;
const MIN_YEAR = 1980;

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads/vehicles');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/* =========================================================
   MULTER CONFIGURATION
========================================================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `vehicle-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
});

/* =========================================================
   UTILITY FUNCTIONS
========================================================= */

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const validateObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid ID format');
  }
};

const sanitizeString = (str) => {
  return str ? str.trim() : '';
};

const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

/* =========================================================
   IMAGE PROCESSING
========================================================= */

const processUploadedImages = async (files) => {
  if (!files || files.length === 0) return [];
  
  const processedImages = await Promise.all(
    files.map(async (file) => {
      try {
        if (process.env.ENABLE_IMAGE_OPTIMIZATION === 'true') {
          const optimizedPath = file.path.replace(/\.(jpg|jpeg|png)$/i, '-optimized.webp');
          
          await sharp(file.path)
            .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toFile(optimizedPath);
          
          deleteFile(file.path);
          file.path = optimizedPath;
          file.filename = path.basename(optimizedPath);
        }
        
        return {
          filename: file.filename,
          originalName: file.originalname,
          path: file.path,
          size: file.size,
          mimetype: file.mimetype,
          url: `/uploads/vehicles/${file.filename}`,
          uploadedAt: new Date()
        };
      } catch (error) {
        console.error('Error processing image:', error);
        deleteFile(file.path);
        throw error;
      }
    })
  );
  
  return processedImages;
};

const deleteVehicleImages = (images) => {
  if (!images || images.length === 0) return;
  
  images.forEach(image => {
    if (image.path) {
      deleteFile(image.path);
    } else if (image.filename) {
      deleteFile(path.join(UPLOAD_DIR, image.filename));
    }
  });
};

/* =========================================================
   VALIDATION FUNCTIONS
========================================================= */

const validateVehicleData = (data) => {
  const errors = [];
  
  if (!sanitizeString(data.name)) errors.push("Vehicle name is required");
  if (!sanitizeString(data.brand)) errors.push("Brand is required");
  if (!sanitizeString(data.type)) errors.push("Type is required");
  if (!sanitizeString(data.licensePlate)) errors.push("License plate is required");
  
  if (!data.pricePerHour || parseFloat(data.pricePerHour) <= 0) {
    errors.push("Price per Hour must be greater than 0");
  }
  
  const licensePlate = sanitizeString(data.licensePlate).toUpperCase();
  if (licensePlate && !LICENSE_PLATE_REGEX.test(licensePlate)) {
    errors.push("Invalid license plate format (expected: KA01AB1234)");
  }
  
  const year = parseInt(data.year);
  const currentYear = new Date().getFullYear();
  if (year && (year < MIN_YEAR || year > currentYear + 1)) {
    errors.push(`Year must be between ${MIN_YEAR} and ${currentYear + 1}`);
  }
  
  return errors;
};

const parseFeatures = (features) => {
  if (!features) return [];
  
  if (typeof features === 'string') {
    return features.split(',').map(f => f.trim()).filter(f => f);
  }
  
  return Array.isArray(features) ? features : [];
};

/* =========================================================
   USER MANAGEMENT ROUTES
========================================================= */

router.get("/users", authMiddleware, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  const search = req.query.search || '';
  
  const query = search 
    ? {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }
    : {};
  
  const [users, totalUsers] = await Promise.all([
    User.find(query).select("-password").skip(skip).limit(limit).lean(),
    User.countDocuments(query)
  ]);
  
  const usersWithBookingCount = await Promise.all(
    users.map(async (user) => {
      const [bookingCount, activeBookings] = await Promise.all([
        Booking.countDocuments({ user: user._id }),
        Booking.countDocuments({ 
          user: user._id, 
          status: { $in: ['Pending', 'Confirmed'] } 
        })
      ]);
      
      return {
        ...user,
        bookingsCount: bookingCount,
        activeBookings: activeBookings,
        avatar: user.avatar || user.profilePicture || null
      };
    })
  );
  
  res.json({ 
    success: true, 
    users: usersWithBookingCount,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers
    }
  });
}));

router.get("/users/:id", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const user = await User.findById(req.params.id).select("-password").lean();
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  
  const [bookingCount, activeBookings, bookings] = await Promise.all([
    Booking.countDocuments({ user: user._id }),
    Booking.countDocuments({ 
      user: user._id, 
      status: { $in: ['Pending', 'Confirmed'] } 
    }),
    Booking.find({ user: user._id })
      .populate('vehicle', 'name brand type')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
  ]);
  
  res.json({
    success: true,
    user: {
      ...user,
      bookingsCount: bookingCount,
      activeBookings: activeBookings,
      recentBookings: bookings
    }
  });
}));

router.patch("/users/:id/block", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: false, updatedAt: new Date() },
    { new: true }
  ).select("_id name email isActive");
  
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  
  res.json({
    success: true,
    message: "User blocked successfully",
    user
  });
}));

router.patch("/users/:id/unblock", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: true, updatedAt: new Date() },
    { new: true }
  ).select("_id name email isActive");
  
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  
  res.json({
    success: true,
    message: "User unblocked successfully",
    user
  });
}));

router.delete("/users/:id", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const activeBookings = await Booking.countDocuments({
    user: req.params.id,
    status: { $in: ['Pending', 'Confirmed'] }
  });
  
  if (activeBookings > 0) {
    return res.status(400).json({
      success: false,
      error: "Cannot delete user with active bookings",
      details: `User has ${activeBookings} active booking(s)`
    });
  }
  
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  
  res.json({
    success: true,
    message: "User deleted successfully"
  });
}));

router.put("/users/:id", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const { name, email, phone, mobile, role } = req.body;
  
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { 
      name: sanitizeString(name), 
      email: sanitizeString(email), 
      phone: sanitizeString(phone), 
      mobile: sanitizeString(mobile), 
      role, 
      updatedAt: new Date() 
    },
    { new: true, runValidators: true }
  ).select("-password");
  
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  
  res.json({
    success: true,
    message: "User updated successfully",
    user
  });
}));

/* =========================================================
   VEHICLE MANAGEMENT ROUTES
========================================================= */

router.get("/vehicles", authMiddleware, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  const search = req.query.search || '';
  const type = req.query.type;
  const availability = req.query.availability;
  
  const query = {};
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { brand: { $regex: search, $options: 'i' } },
      { licensePlate: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (type) query.type = type;
  if (availability !== undefined) query.isAvailable = availability === 'true';
  
  const [vehicles, totalVehicles] = await Promise.all([
    Vehicle.find(query).skip(skip).limit(limit).lean(),
    Vehicle.countDocuments(query)
  ]);
  
  const vehiclesWithBookingData = await Promise.all(
    vehicles.map(async (vehicle) => {
      const [bookingCount, activeBookings, completedBookings, revenue] = await Promise.all([
        Booking.countDocuments({ vehicle: vehicle._id }),
        Booking.countDocuments({
          vehicle: vehicle._id,
          status: { $in: ["Pending", "Confirmed"] },
        }),
        Booking.countDocuments({
          vehicle: vehicle._id,
          status: "Completed"
        }),
        Booking.aggregate([
          { 
            $match: { 
              vehicle: vehicle._id,
              status: "Completed",
              "payment.status": "Success"
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$payment.amount" }
            }
          }
        ])
      ]);
      
      const processedImages = vehicle.images
        ? vehicle.images.map(img => img.url).filter(Boolean)
        : [];

      return {
        ...vehicle,
        images: processedImages,
        bookingsCount: bookingCount,
        activeBookings,
        completedBookings,
        totalRevenue: revenue.length > 0 ? revenue[0].total : 0
      };
    })
  );
  
  res.json({
    success: true,
    vehicles: vehiclesWithBookingData,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalVehicles / limit),
      totalVehicles
    }
  });
}));

router.get("/vehicles/:id", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const vehicle = await Vehicle.findById(req.params.id).lean();
  if (!vehicle) {
    return res.status(404).json({ success: false, error: "Vehicle not found" });
  }
  
  const [bookingCount, activeBookings, bookings] = await Promise.all([
    Booking.countDocuments({ vehicle: vehicle._id }),
    Booking.countDocuments({
      vehicle: vehicle._id,
      status: { $in: ['Pending', 'Confirmed'] }
    }),
    Booking.find({ vehicle: vehicle._id })
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
  ]);
  
  const processedImages = vehicle.images
    ? vehicle.images.map(img => img.url).filter(Boolean)
    : [];
  
  res.json({
    success: true,
    vehicle: {
      ...vehicle,
      images: processedImages,
      bookingsCount: bookingCount,
      activeBookings: activeBookings,
      recentBookings: bookings
    }
  });
}));

router.post("/vehicles", authMiddleware, upload.array('images', MAX_FILES), asyncHandler(async (req, res) => {
  const validationErrors = validateVehicleData(req.body);
  if (validationErrors.length > 0) {
    if (req.files) {
      req.files.forEach(file => deleteFile(file.path));
    }
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: validationErrors
    });
  }
  
  const licensePlate = sanitizeString(req.body.licensePlate).toUpperCase();
  const existingVehicle = await Vehicle.findOne({ licensePlate });
  if (existingVehicle) {
    if (req.files) {
      req.files.forEach(file => deleteFile(file.path));
    }
    return res.status(400).json({
      success: false,
      error: "Duplicate license plate",
      details: "This license plate is already registered."
    });
  }
  
  let uploadedImages = [];
  try {
    uploadedImages = await processUploadedImages(req.files);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Image processing failed",
      details: error.message
    });
  }
  
  const capacity = parseInt(req.body.capacity) || 4;
  
  const vehicleData = {
    name: sanitizeString(req.body.name),
    brand: sanitizeString(req.body.brand),
    type: sanitizeString(req.body.type),
    licensePlate,
    capacity,
    seats: capacity,
    pricePerHour: parseFloat(req.body.pricePerHour) || 0,
    pricePerKM: parseFloat(req.body.pricePerKM) || 0,
    location: sanitizeString(req.body.location),
    baseLocation: sanitizeString(req.body.baseLocation) || sanitizeString(req.body.location),
    currentLocation: sanitizeString(req.body.currentLocation) || sanitizeString(req.body.location),
    fuelType: sanitizeString(req.body.fuelType),
    transmission: sanitizeString(req.body.transmission),
    year: parseInt(req.body.year) || new Date().getFullYear(),
    color: sanitizeString(req.body.color),
    features: parseFeatures(req.body.features),
    images: uploadedImages,
    isAvailable: req.body.isAvailable === 'true' || req.body.isAvailable === true,
    isBooked: false
  };
  
  try {
    const vehicle = new Vehicle(vehicleData);
    await vehicle.save();
    
    res.status(201).json({
      success: true,
      message: `Vehicle added successfully with ${uploadedImages.length} images`,
      vehicle
    });
  } catch (error) {
    deleteVehicleImages(uploadedImages);
    throw error;
  }
}));

router.put("/vehicles/:id", authMiddleware, upload.array('images', MAX_FILES), asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const existingVehicle = await Vehicle.findById(req.params.id);
  if (!existingVehicle) {
    if (req.files) {
      req.files.forEach(file => deleteFile(file.path));
    }
    return res.status(404).json({
      success: false,
      error: "Vehicle not found"
    });
  }
  
  let newUploadedImages = [];
  try {
    newUploadedImages = await processUploadedImages(req.files);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Image processing failed",
      details: error.message
    });
  }
  
  let allImages = [...(existingVehicle.images || [])];
  let imagesToDelete = [];
  
  if (req.body.imagesToRemove) {
    try {
      const imagesToRemove = JSON.parse(req.body.imagesToRemove);
      imagesToDelete = allImages.filter(img => imagesToRemove.includes(img.url));
      allImages = allImages.filter(img => !imagesToRemove.includes(img.url));
    } catch (error) {
      console.error('Error parsing imagesToRemove:', error);
    }
  }
  
  allImages = [...allImages, ...newUploadedImages].slice(0, MAX_FILES);
  
  const capacity = req.body.capacity ? parseInt(req.body.capacity) : existingVehicle.capacity;
  
  const updateData = {
    name: sanitizeString(req.body.name) || existingVehicle.name,
    brand: sanitizeString(req.body.brand) || existingVehicle.brand,
    type: sanitizeString(req.body.type) || existingVehicle.type,
    licensePlate: (sanitizeString(req.body.licensePlate) || existingVehicle.licensePlate).toUpperCase(),
    capacity,
    seats: capacity,
    pricePerHour: req.body.pricePerHour ? parseFloat(req.body.pricePerHour) : existingVehicle.pricePerHour,
    pricePerKM: req.body.pricePerKM ? parseFloat(req.body.pricePerKM) : existingVehicle.pricePerKM,
    location: sanitizeString(req.body.location) || existingVehicle.location,
    baseLocation: sanitizeString(req.body.baseLocation) || existingVehicle.baseLocation,
    currentLocation: sanitizeString(req.body.currentLocation) || existingVehicle.currentLocation,
    fuelType: sanitizeString(req.body.fuelType) || existingVehicle.fuelType,
    transmission: sanitizeString(req.body.transmission) || existingVehicle.transmission,
    year: req.body.year ? parseInt(req.body.year) : existingVehicle.year,
    color: sanitizeString(req.body.color) || existingVehicle.color,
    features: req.body.features !== undefined ? parseFeatures(req.body.features) : existingVehicle.features,
    images: allImages,
    isAvailable: req.body.isAvailable !== undefined
      ? (req.body.isAvailable === 'true' || req.body.isAvailable === true)
      : existingVehicle.isAvailable,
    updatedAt: new Date()
  };
  
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    deleteVehicleImages(imagesToDelete);
    
    res.json({
      success: true,
      message: "Vehicle updated successfully",
      vehicle
    });
  } catch (error) {
    deleteVehicleImages(newUploadedImages);
    throw error;
  }
}));

router.delete("/vehicles/:id", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) {
    return res.status(404).json({
      success: false,
      error: "Vehicle not found"
    });
  }
  
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
  
  deleteVehicleImages(vehicle.images);
  await Vehicle.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: "Vehicle deleted successfully"
  });
}));

router.patch("/vehicles/:id/toggle-availability", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) {
    return res.status(404).json({
      success: false,
      error: "Vehicle not found"
    });
  }
  
  vehicle.isAvailable = !vehicle.isAvailable;
  vehicle.updatedAt = new Date();
  await vehicle.save();
  
  res.json({
    success: true,
    message: `Vehicle ${vehicle.isAvailable ? "made available" : "made unavailable"}`,
    vehicle: {
      _id: vehicle._id,
      name: vehicle.name,
      licensePlate: vehicle.licensePlate,
      isAvailable: vehicle.isAvailable
    }
  });
}));

/* =========================================================
   BOOKING MANAGEMENT ROUTES
========================================================= */

router.get("/bookings", authMiddleware, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  const status = req.query.status;
  
  const query = status ? { status } : {};
  
  const [bookings, totalBookings] = await Promise.all([
    Booking.find(query)
      .populate("user", "name email phone")
      .populate("vehicle", "name brand type licensePlate")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Booking.countDocuments(query)
  ]);
  
  res.json({
    success: true,
    bookings,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalBookings / limit),
      totalBookings
    }
  });
}));

router.get("/bookings/:id", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const booking = await Booking.findById(req.params.id)
    .populate("user", "name email phone")
    .populate("vehicle", "name brand type licensePlate images")
    .lean();
  
  if (!booking) {
    return res.status(404).json({
      success: false,
      error: "Booking not found"
    });
  }
  
  res.json({
    success: true,
    booking
  });
}));

router.put("/bookings/:id/status", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const { status } = req.body;
  const validStatuses = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: "Invalid status",
      validStatuses
    });
  }
  
  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    { status, updatedAt: new Date() },
    { new: true }
  ).populate("user", "name email")
   .populate("vehicle", "name brand");
  
  if (!booking) {
    return res.status(404).json({
      success: false,
      error: "Booking not found"
    });
  }
  
  res.json({
    success: true,
    message: `Booking status updated to ${status}`,
    booking
  });
}));

router.delete("/bookings/:id", authMiddleware, asyncHandler(async (req, res) => {
  validateObjectId(req.params.id);
  
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({
      success: false,
      error: "Booking not found"
    });
  }
  
  if (booking.status === 'Confirmed') {
    return res.status(400).json({
      success: false,
      error: "Cannot delete confirmed booking",
      details: "Please cancel the booking first"
    });
  }
  
  await Booking.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: "Booking deleted successfully"
  });
}));

/* =========================================================
   ANALYTICS & DASHBOARD
========================================================= */

router.get("/dashboard/stats", authMiddleware, asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalVehicles,
    totalBookings,
    activeBookings,
    completedBookings,
    revenue,
    recentBookings
  ] = await Promise.all([
    User.countDocuments(),
    Vehicle.countDocuments(),
    Booking.countDocuments(),
    Booking.countDocuments({ status: { $in: ['Pending', 'Confirmed'] } }),
    Booking.countDocuments({ status: 'Completed' }),
    Booking.aggregate([
      {
        $match: {
          status: 'Completed',
          'payment.status': 'Success'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment.amount' }
        }
      }
    ]),
    Booking.find()
      .populate('user', 'name email')
      .populate('vehicle', 'name brand licensePlate')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
  ]);
  
  res.json({
    success: true,
    stats: {
      totalUsers,
      totalVehicles,
      totalBookings,
      activeBookings,
      completedBookings,
      totalRevenue: revenue.length > 0 ? revenue[0].total : 0,
      recentBookings
    }
  });
}));

/* =========================================================
   ERROR HANDLER
========================================================= */

export default router;