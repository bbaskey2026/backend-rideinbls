import express from "express";
import axios from "axios";
import Vehicle from "../models/Vehicle.js";

const router = express.Router();

/**
 * ========================
 *  AUTOCOMPLETE ENDPOINT
 * ========================
 */
router.get("/autocomplete", async (req, res) => {
  const { input } = req.query;

  if (!input || input.trim() === "") {
    return res.status(400).json({
      success: false,
      error: "Input parameter is required and cannot be empty"
    });
  }

  try {
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Service configuration error"
      });
    }

    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/place/autocomplete/json",
      {
        params: {
          input: input.trim(),
          key: GOOGLE_MAPS_API_KEY,
          types: "(cities)",
          language: "en",
          components: "country:in", // ✅ restrict to India
        },
        timeout: 10000,
      }
    );

    if (response.data.status !== "OK" && response.data.status !== "ZERO_RESULTS") {
      return res.status(400).json({
        success: false,
        error: "Google Places API error",
        details: response.data.status,
        message: response.data.error_message || "Unknown error"
      });
    }

    return res.json({
      success: true,
      data: response.data,
      predictions: response.data.predictions || []
    });
  } catch (error) {
    console.error("Autocomplete error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch places",
      details: error.response?.data?.error_message || error.message
    });
  }
});

/**
 * ========================
 *  PLACE DETAILS ENDPOINT
 * ========================
 */
router.get("/details", async (req, res) => {
  const { place_id } = req.query;

  if (!place_id || place_id.trim() === "") {
    return res.status(400).json({
      success: false,
      error: "Place ID is required and cannot be empty"
    });
  }

  try {
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Service configuration error"
      });
    }

    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/place/details/json",
      {
        params: {
          place_id: place_id.trim(),
          key: GOOGLE_MAPS_API_KEY,
          fields: "formatted_address,geometry,name,place_id",
          language: "en",
          region: "in" // ✅ hint results towards India
        },
        timeout: 10000,
      }
    );

    if (response.data.status !== "OK") {
      return res.status(400).json({
        success: false,
        error: "Google Places API error",
        details: response.data.status,
        message: response.data.error_message || "Unknown error"
      });
    }

    return res.json({
      success: true,
      data: response.data,
      result: response.data.result || null
    });
  } catch (error) {
    console.error("Place details error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch place details",
      details: error.response?.data?.error_message || error.message
    });
  }
});

/**
 * ============================================================
 *  DISTANCE CALCULATION + VEHICLE AVAILABILITY & PRICE LOGIC
 * ============================================================
 */
router.post("/distance-calculate", async (req, res) => {
  const { source, destination } = req.body;

  if (!source || !destination || source.trim() === "" || destination.trim() === "") {
    return res.status(400).json({
      success: false,
      error: "Source and destination are required and cannot be empty"
    });
  }

  try {
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Service configuration error"
      });
    }

    const distanceRes = await axios.get(
      "https://maps.googleapis.com/maps/api/distancematrix/json",
      {
        params: {
          origins: source.trim(),
          destinations: destination.trim(),
          units: "metric",
          key: GOOGLE_MAPS_API_KEY,
          mode: "driving",
          region: "in" // ✅ restrict calculations towards India
        },
        timeout: 15000,
      }
    );

    if (distanceRes.data.status !== "OK") {
      return res.status(400).json({
        success: false,
        error: "Google Distance Matrix API error",
        details: distanceRes.data.status,
        message: distanceRes.data.error_message || "Unknown error"
      });
    }

    const element = distanceRes?.data?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") {
      return res.status(400).json({
        success: false,
        error: "Could not calculate route",
        details: element?.status || "No data"
      });
    }

    const distanceInKm = parseFloat((element.distance.value / 1000).toFixed(2));
    const distanceText = element.distance?.text || "";
    const durationText = element.duration?.text || "";
    const durationInSeconds = element.duration?.value || 0;

    // ✅ Only fetch AVAILABLE vehicles (removed fallback)
   const vehicles = await Vehicle.find({
  isAvailable: true,
  isBooked: false,
  pricePerKM: { $exists: true, $gt: 0 }
}).lean();

    // Map vehicles with price
    const vehiclesWithPrice = vehicles.map(vehicle => {
      const totalPrice = parseFloat((distanceInKm * vehicle.pricePerKM).toFixed(2));
      return {
        _id: vehicle._id,
        name: vehicle.name,
        brand: vehicle.brand,
        type: vehicle.type,
        seats: vehicle.seats,
        pricePerKM: vehicle.pricePerKM,
        pricePerHour: vehicle.pricePerHour,
        images: vehicle.images || [],
        features: vehicle.features || [],
        licensePlate: vehicle.licensePlate,
        mileage: vehicle.mileage,
        description: vehicle.description,
        available: vehicle.available,
        isBooked: vehicle.isBooked,
        baseLocation: vehicle.baseLocation,
        currentLocation: vehicle.currentLocation,
        totalDistance: { km: distanceInKm, text: distanceText, meters: element.distance.value },
        estimatedDuration: { text: durationText, seconds: durationInSeconds, minutes: Math.round(durationInSeconds / 60) },
        totalPrice,
        priceBreakdown: {
          rate: vehicle.pricePerKM,
          distance: distanceInKm,
          total: totalPrice,
          pricingModel: "per-kilometer"
        }
      };
    });

    vehiclesWithPrice.sort((a, b) => a.totalPrice - b.totalPrice);

    return res.json({
      success: true,
      message: `Found ${vehiclesWithPrice.length} available vehicles`,
      route: {
        source: source.trim(),
        destination: destination.trim(),
        distance: distanceInKm,
        distanceText,
        duration: durationText,
        durationMinutes: Math.round(durationInSeconds / 60)
      },
      vehicles: vehiclesWithPrice
    });
  } catch (err) {
    console.error("Error in distance-calculate:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to calculate distance and fetch vehicles",
      details: err.message
    });
  }
});

export default router;
