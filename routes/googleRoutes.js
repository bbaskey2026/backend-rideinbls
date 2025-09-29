import express from "express";
import axios from "axios";
import Vehicle from "../models/Vehicle.js";
//import {authMiddleware} from "../middleware/authMiddleware.js"; // Add auth middleware

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
      console.error("Google Maps API key is not configured");
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
          types: "(cities)", // Optional: restrict to cities for better results
          language: "en", // Optional: set language
        },
        timeout: 10000, // 10 second timeout
      }
    );

    // Check if Google API returned an error
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
    
    if (error.code === "ECONNABORTED") {
      return res.status(408).json({ 
        success: false,
        error: "Request timeout - please try again" 
      });
    }
    
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
      console.error("Google Maps API key is not configured");
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
          fields: "formatted_address,geometry,name,place_id", // Specify needed fields
        },
        timeout: 10000,
      }
    );

    // Check if Google API returned an error
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
    
    if (error.code === "ECONNABORTED") {
      return res.status(408).json({ 
        success: false,
        error: "Request timeout - please try again" 
      });
    }
    
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

    // Google Distance Matrix API
    const distanceRes = await axios.get(
      "https://maps.googleapis.com/maps/api/distancematrix/json",
      {
        params: {
          origins: source.trim(),
          destinations: destination.trim(),
          units: "metric",
          key: GOOGLE_MAPS_API_KEY,
          mode: "driving",
        },
        timeout: 15000,
      }
    );

    // Check if Google API returned an error
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
      let errorMessage = "Could not calculate route";
      if (element?.status === "NOT_FOUND") {
        errorMessage = "One or both locations not found";
      } else if (element?.status === "ZERO_RESULTS") {
        errorMessage = "No route found between these locations";
      }
      
      return res.status(400).json({
        success: false,
        error: errorMessage,
        details: element?.status || "No data"
      });
    }

    const distanceInKm = parseFloat((element.distance.value / 1000).toFixed(2));
    const distanceText = element.distance?.text || "";
    const durationText = element.duration?.text || "";
    const durationInSeconds = element.duration?.value || 0;

    // Simplified query to fetch all available vehicles
    const vehicles = await Vehicle.find({
      available: true,
      pricePerKM: { $exists: true, $gt: 0 },
      $or: [
        { isBooked: { $exists: false } },
        { isBooked: false },
        { isBooked: null }
      ]
    }).lean();

    console.log(`Found ${vehicles.length} vehicles in database`);

    // If no vehicles found with strict criteria, try broader search
    if (vehicles.length === 0) {
      const allVehicles = await Vehicle.find({ pricePerKM: { $gt: 0 } }).lean();
      console.log(`Trying broader search: found ${allVehicles.length} vehicles with pricing`);
      vehicles.push(...allVehicles);
    }

    // Map vehicles with totalPrice and all required data
    const vehiclesWithPrice = vehicles.map(vehicle => {
      const totalPrice = vehicle.pricePerKM ? parseFloat((distanceInKm * vehicle.pricePerKM).toFixed(2)) : null;

      // Process images according to your schema structure
      const processedImages = [];
      if (Array.isArray(vehicle.images)) {
        vehicle.images.forEach(img => {
          if (typeof img === 'string') {
            // Simple string URLs
            processedImages.push(img);
          } else if (img && typeof img === 'object') {
            // Complex image objects from your schema
            if (img.filename) {
              // Construct URL based on your storage system
              const imageUrl = img.storageType === 'gridfs' 
                ? `/api/files/${img.fileId || img.filename}`
                : img.filename;
              processedImages.push(imageUrl);
            }
          }
        });
      }

      return {
        _id: vehicle._id,
        name: vehicle.name || "Unknown Vehicle",
        brand: vehicle.brand || "Unknown Brand",
        type: vehicle.type || "Other",
        seats: vehicle.seats || 4,
        pricePerKM: vehicle.pricePerKM || null,
        pricePerHour: vehicle.pricePerHour || null,
        images: processedImages,
        features: Array.isArray(vehicle.features) ? vehicle.features : [],
        licensePlate: vehicle.licensePlate || "N/A",
        location: vehicle.location || vehicle.currentLocation || vehicle.baseLocation || "Unknown",
        mileage: vehicle.mileage || null,
        description: vehicle.description || "",
        available: vehicle.available,
        isBooked: Boolean(vehicle.isBooked),
        // Booking details from schema
        bookedBy: vehicle.bookedBy || null,
        bookedByName: vehicle.bookedByName || null,
        origin: vehicle.origin || null,
        destination: vehicle.destination || null,
        isRoundTrip: Boolean(vehicle.isRoundTrip),
        baseLocation: vehicle.baseLocation || null,
        currentLocation: vehicle.currentLocation || null,
        // Distance and pricing info
        totalDistance: {
          km: distanceInKm,
          text: distanceText,
          meters: element.distance.value,
        },
        estimatedDuration: {
          text: durationText,
          seconds: durationInSeconds,
          minutes: Math.round(durationInSeconds / 60)
        },
        totalPrice,
        priceBreakdown: {
          rate: vehicle.pricePerKM,
          distance: distanceInKm,
          total: totalPrice,
          pricingModel: "per-kilometer"
        },
        lastUpdated: new Date().toISOString()
      };
    });

    // Filter out vehicles without any pricing
    const validVehicles = vehiclesWithPrice.filter(v => v.totalPrice !== null && v.totalPrice > 0);

    // Sort vehicles by price (lowest first)
    validVehicles.sort((a, b) => a.totalPrice - b.totalPrice);

    console.log(`Returning ${validVehicles.length} valid vehicles with pricing`);

    // Enhanced response with more details
    return res.json({
      success: true,
      message: `Found ${validVehicles.length} available vehicles`,
      route: {
        source: source.trim(),
        destination: destination.trim(),
        distance: distanceInKm,
        distanceText: distanceText,
        duration: durationText,
        durationMinutes: Math.round(durationInSeconds / 60)
      },
      // Legacy fields for backward compatibility
      distance: distanceInKm,
      vehicles: validVehicles,
      // Additional metadata
      metadata: {
        totalVehiclesFound: vehicles.length,
        validVehiclesWithPricing: validVehicles.length,
        searchTimestamp: new Date().toISOString(),
        priceRange: validVehicles.length > 0 ? {
          min: Math.min(...validVehicles.map(v => v.totalPrice)),
          max: Math.max(...validVehicles.map(v => v.totalPrice))
        } : null
      }
    });

  } catch (err) {
    console.error("Error in distance-calculate:", err.message);
    console.error("Stack trace:", err.stack);

    // Handle different types of errors
    if (err.code === "ECONNABORTED") {
      return res.status(408).json({
        success: false,
        error: "Request timeout - please try again",
        details: "Google API request timed out"
      });
    }

    if (err.response?.status === 403) {
      return res.status(500).json({
        success: false,
        error: "Google API access denied",
        details: "Please check API key and billing settings"
      });
    }

    if (err.response?.status === 429) {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded",
        details: "Too many requests to Google API"
      });
    }

    if (err.response) {
      return res.status(500).json({
        success: false,
        error: "External service error",
        details: err.response.data?.error_message || err.message,
      });
    }

    if (err.name === "MongoError" || err.name === "MongooseError" || err.name === "ValidationError") {
      return res.status(500).json({ 
        success: false,
        error: "Database error",
        details: "Failed to fetch vehicles from database"
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to calculate distance and fetch vehicles",
      details: err.message
    });
  }
});

export default router;