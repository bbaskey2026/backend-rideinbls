import * as vehicleService from "../services/vehicleService.js";

// 1. List Available Vehicles
export const getVehicles = async (req, res, next) => {
  try {
    const { category, type, isAvailable, isBooked, all } = req.query;
    const vehicles = await vehicleService.getVehicles({
      category,
      type,
      isAvailable,
      isBooked,
      all,
    });

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
    const vehicle = await vehicleService.getVehicleById(id);

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
    const vehicle = await vehicleService.createVehicle(req.body);

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
    const updated = await vehicleService.updateVehicle(id, req.body);

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
    await vehicleService.deleteVehicle(id);

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
    const vehicle = await vehicleService.toggleAvailability(id);

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
