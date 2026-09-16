// services/vehicleService.js
import mongoose from "mongoose";
import Vehicle from "../models/Vehicle.js";
import { logger } from "../middleware/logger.js";

class VehicleService {
  /**
   * 1. List Vehicles with filtering
   */
  async getVehicles(filterData = {}) {
    const category = filterData.category ?? null;
    const type = filterData.type ?? null;
    const isAvailable = filterData.isAvailable ?? true;
    const isBooked = filterData.isBooked ?? false;
    const all = filterData.all === true || filterData.all === "true";

    const query = {};
    if (category && category !== "All") {
      query.category = { $regex: new RegExp(`^${category}$`, "i") };
    }
    if (type && type !== "All") {
      query.type = { $regex: new RegExp(`^${type}$`, "i") };
    }
    if (!all) {
      if (isAvailable === false || isAvailable === "false") {
        query.isAvailable = { $in: [false, "false"] };
      } else if (isAvailable === true || isAvailable === "true") {
        query.isAvailable = { $nin: [false, "false"] };
      }

      if (isBooked === true || isBooked === "true") {
        query.isBooked = { $in: [true, "true"] };
      } else if (isBooked === false || isBooked === "false") {
        query.isBooked = { $nin: [true, "true"] };
      }
    }

    logger.info(`[VehicleService] Fetching vehicles with filter: ${JSON.stringify(query)}`);
    return await Vehicle.find(query).sort({ createdAt: -1 });
  }

  /**
   * 2. Get Vehicle by ID
   */
  async getVehicleById(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid vehicle ID format");
      error.statusCode = 400;
      throw error;
    }

    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      const error = new Error("Vehicle not found");
      error.statusCode = 404;
      throw error;
    }

    return vehicle;
  }

  /**
   * 3. Create Vehicle (Admin)
   */
  async createVehicle(reqData = {}) {
    logger.info(`[VehicleService] Creating vehicle: ${reqData.name ?? "unnamed"}`);
    return await Vehicle.create(reqData);
  }

  /**
   * 4. Update Vehicle (Admin)
   */
  async updateVehicle(id, reqData = {}) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid vehicle ID format");
      error.statusCode = 400;
      throw error;
    }

    logger.info(`[VehicleService] Updating vehicle ID: ${id}`);
    const updated = await Vehicle.findByIdAndUpdate(id, reqData, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      const error = new Error("Vehicle not found");
      error.statusCode = 404;
      throw error;
    }

    return updated;
  }

  /**
   * 5. Delete Vehicle (Admin)
   */
  async deleteVehicle(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid vehicle ID format");
      error.statusCode = 400;
      throw error;
    }

    logger.info(`[VehicleService] Deleting vehicle ID: ${id}`);
    const deleted = await Vehicle.findByIdAndDelete(id);
    if (!deleted) {
      const error = new Error("Vehicle not found");
      error.statusCode = 404;
      throw error;
    }

    return deleted;
  }

  /**
   * 6. Toggle Vehicle Availability (Admin)
   */
  async toggleAvailability(id) {
    const vehicle = await this.getVehicleById(id);
    vehicle.isAvailable = !vehicle.isAvailable;
    if (!vehicle.isAvailable) {
      vehicle.isBooked = false;
      vehicle.bookedBy = null;
    }
    await vehicle.save();
    return vehicle;
  }
}

const vehicleService = new VehicleService();
export default vehicleService;
export { VehicleService, vehicleService };
