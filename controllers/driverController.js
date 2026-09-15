import Driver from "../models/Driver.js";

/**
 * Register / Onboard a driver
 */
export const registerDriver = async (req, res, next) => {
  try {
    const existingDriver = await Driver.findOne({
      $or: [{ email: req.body.email }, { mobile: req.body.mobile }, { licenseNumber: req.body.licenseNumber }],
    });

    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message: "Driver with this email, mobile, or license number already exists",
      });
    }

    const driver = new Driver(req.body);
    await driver.save();

    res.status(201).json({
      success: true,
      message: "Driver application submitted successfully",
      driver,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all drivers (Admin)
 */
export const getAllDrivers = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { licenseNumber: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Driver.countDocuments(query);
    const drivers = await Driver.find(query)
      .populate("assignedVehicle")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      drivers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Driver by ID
 */
export const getDriverById = async (req, res, next) => {
  try {
    const driver = await Driver.findById(req.params.id).populate("assignedVehicle");
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }
    res.json({ success: true, driver });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Driver
 */
export const updateDriver = async (req, res, next) => {
  try {
    const driver = await Driver.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    res.json({
      success: true,
      message: "Driver profile updated successfully",
      driver,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Driver
 */
export const deleteDriver = async (req, res, next) => {
  try {
    const driver = await Driver.findByIdAndDelete(req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }
    res.json({ success: true, message: "Driver removed successfully" });
  } catch (error) {
    next(error);
  }
};
