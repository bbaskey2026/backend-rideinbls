// services/driverService.js
import mongoose from "mongoose";
import Driver from "../models/Driver.js";
import { logger } from "../middleware/logger.js";

class DriverService {
  /**
   * 1. Register / Onboard Driver
   */
  async registerDriver(reqData = {}) {
    const email = reqData.email ?? null;
    const mobile = reqData.mobile ?? null;
    const licenseNumber = reqData.licenseNumber ?? null;

    logger.info(`[DriverService] Processing driver application for email: ${email}`);

    const existingDriver = await Driver.findOne({
      $or: [{ email }, { mobile }, { licenseNumber }],
    });

    if (existingDriver) {
      const error = new Error("Driver with this email, mobile, or license number already exists");
      error.statusCode = 400;
      throw error;
    }

    const driver = new Driver(reqData);
    await driver.save();
    return driver;
  }

  /**
   * 2. Get All Drivers (Admin)
   */
  async getAllDrivers(filterData = {}) {
    const status = filterData.status ?? null;
    const search = filterData.search ?? null;
    const page = Number(filterData.page ?? 1);
    const limit = Number(filterData.limit ?? 20);

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
      .limit(limit);

    return {
      total,
      page,
      totalPages: Math.ceil(total / limit),
      drivers,
    };
  }

  /**
   * 3. Get Driver by ID
   */
  async getDriverById(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid driver ID format");
      error.statusCode = 400;
      throw error;
    }

    const driver = await Driver.findById(id).populate("assignedVehicle");
    if (!driver) {
      const error = new Error("Driver not found");
      error.statusCode = 404;
      throw error;
    }

    return driver;
  }

  /**
   * 4. Update Driver
   */
  async updateDriver(id, reqData = {}) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid driver ID format");
      error.statusCode = 400;
      throw error;
    }

    logger.info(`[DriverService] Updating driver ID: ${id}`);
    const driver = await Driver.findByIdAndUpdate(id, reqData, {
      new: true,
      runValidators: true,
    });

    if (!driver) {
      const error = new Error("Driver not found");
      error.statusCode = 404;
      throw error;
    }

    return driver;
  }

  /**
   * 5. Delete Driver
   */
  async deleteDriver(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid driver ID format");
      error.statusCode = 400;
      throw error;
    }

    logger.info(`[DriverService] Deleting driver ID: ${id}`);
    const driver = await Driver.findByIdAndDelete(id);
    if (!driver) {
      const error = new Error("Driver not found");
      error.statusCode = 404;
      throw error;
    }

    return driver;
  }
}

const driverService = new DriverService();
export default driverService;
export { DriverService, driverService };
