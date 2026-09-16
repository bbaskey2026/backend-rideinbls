import * as driverService from "../services/driverService.js";

/**
 * Register / Onboard a driver
 */
export const registerDriver = async (req, res, next) => {
  try {
    const driver = await driverService.registerDriver(req.body);
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
    const result = await driverService.getAllDrivers({ status, search, page, limit });
    res.json({
      success: true,
      ...result,
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
    const driver = await driverService.getDriverById(req.params.id);
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
    const driver = await driverService.updateDriver(req.params.id, req.body);
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
    await driverService.deleteDriver(req.params.id);
    res.json({ success: true, message: "Driver removed successfully" });
  } catch (error) {
    next(error);
  }
};
