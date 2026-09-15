import mongoose from "mongoose";
import Vehicle from "../models/Vehicle.js";

// 1. List Available Vehicles
export const getVehicles = async (req, res, next) => {
  try {
    const { category, type, isAvailable } = req.query;

    let query = {};
    if (category && category !== "All") {
      query.category = { $regex: new RegExp(`^${category}$`, "i") };
    }
    if (type && type !== "All") {
      query.type = { $regex: new RegExp(`^${type}$`, "i") };
    }
    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === "true";
    }

    const vehicles = await Vehicle.find(query).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: vehicles,
      count: vehicles.length,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Get Vehicle by ID
export const getVehicleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid vehicle ID" });
    }

    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: "Vehicle not found" });
    }

    return res.status(200).json({
      success: true,
      data: vehicle,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Admin Create Vehicle
export const createVehicle = async (req, res, next) => {
  try {
    const vehicleData = req.body;
    const vehicle = await Vehicle.create(vehicleData);

    return res.status(201).json({
      success: true,
      message: "Vehicle added to fleet successfully",
      data: vehicle,
    });
  } catch (error) {
    next(error);
  }
};

// 4. Admin Update Vehicle
export const updateVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid vehicle ID" });
    }

    const updated = await Vehicle.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: "Vehicle not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Vehicle updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 5. Admin Delete Vehicle
export const deleteVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid vehicle ID" });
    }

    const deleted = await Vehicle.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Vehicle not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Vehicle deleted from catalog",
    });
  } catch (error) {
    next(error);
  }
};

// 6. Admin Toggle Availability
export const toggleAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid vehicle ID" });
    }

    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: "Vehicle not found" });
    }

    vehicle.isAvailable = !vehicle.isAvailable;
    await vehicle.save();

    return res.status(200).json({
      success: true,
      message: `Vehicle availability set to ${vehicle.isAvailable ? "Available" : "Unavailable"}`,
      data: vehicle,
    });
  } catch (error) {
    next(error);
  }
};

// Aliases for route flexibility
export const getAllVehicles = getVehicles;
export const getAvailableVehicles = getVehicles;

