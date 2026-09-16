// services/pricingService.js
import Vehicle from "../models/Vehicle.js";
import { logger } from "../middleware/logger.js";

const DEFAULT_GST_PERCENT = 5; // 5% GST for Cab / Transport Services in India

class PricingService {
  /**
   * Calculate detailed fare breakdown based on vehicle rates, distance, duration, and GST
   */
  calculateFare(reqData = {}) {
    const vehicle = reqData.vehicle ?? {};
    const distanceKm = Number(reqData.distanceKm ?? reqData.distance ?? 0);
    const durationHours = Number(reqData.durationHours ?? reqData.hours ?? 0);
    const isRoundTrip = Boolean(reqData.isRoundTrip ?? false);
    const customGstPercent = reqData.gstPercent !== undefined ? Number(reqData.gstPercent) : DEFAULT_GST_PERCENT;
    const tollAndTaxes = Number(reqData.tollAndTaxes ?? 0);

    // 1. Determine rates from vehicle model (support pricePerKM, pricePerKm, pricePerHour, baseFare)
    const ratePerKm = Number(vehicle.pricePerKM ?? vehicle.pricePerKm ?? vehicle.price ?? 13);
    const ratePerHour = Number(vehicle.pricePerHour ?? 170);
    const baseFare = Number(vehicle.baseFare ?? 0);
    const driverAllowancePerDay = Number(vehicle.driverAllowancePerDay ?? 0);

    // 2. Distance Fare calculation
    const effectiveDistance = isRoundTrip ? distanceKm * 2 : distanceKm;
    const distanceFare = Math.round(effectiveDistance * ratePerKm);

    // 3. Duration / Hourly Fare calculation
    const durationFare = Math.round(durationHours * ratePerHour);

    // 4. Driver Allowance calculation (if days / multi-hour trip)
    const days = Math.max(1, Math.ceil(durationHours / 24));
    const driverAllowance = driverAllowancePerDay > 0 ? days * driverAllowancePerDay : 0;

    // 5. Subtotal before taxes
    const subtotal = Math.max(
      baseFare,
      baseFare + distanceFare + durationFare + driverAllowance + tollAndTaxes
    );

    // 6. GST Calculation (5% standard)
    const gstAmount = Math.round((subtotal * customGstPercent) / 100);

    // 7. Total final amount
    const totalPrice = subtotal + gstAmount;

    logger.info(
      `[PricingService] Fare calculated: Distance=${effectiveDistance}km @ ₹${ratePerKm}/km, Hours=${durationHours}h @ ₹${ratePerHour}/h => Subtotal=₹${subtotal}, GST(${customGstPercent}%)=₹${gstAmount}, Total=₹${totalPrice}`
    );

    return {
      vehicleId: vehicle._id ?? null,
      vehicleName: vehicle.name ?? "Vehicle",
      ratePerKm,
      ratePerHour,
      baseFare,
      distanceKm: effectiveDistance,
      durationHours,
      isRoundTrip,
      breakdown: {
        distanceFare,
        durationFare,
        driverAllowance,
        baseFare,
        tollAndTaxes,
        subtotal,
        gstRate: customGstPercent,
        gstAmount,
      },
      totalPrice,
    };
  }

  /**
   * Fetch vehicle by ID and compute fare breakdown
   */
  async calculateVehicleFare(vehicleId, reqData = {}) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      const error = new Error("Vehicle not found");
      error.statusCode = 404;
      throw error;
    }

    return this.calculateFare({
      ...reqData,
      vehicle,
    });
  }
}

const pricingService = new PricingService();
export default pricingService;
export { PricingService, pricingService };
