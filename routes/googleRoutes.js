import express from "express";
import {
  autocomplete,
  placeDetails,
  calculateDistance,
} from "../controllers/googleController.js";

const router = express.Router();

// Autocomplete
router.get("/autocomplete", autocomplete);
router.post("/autocomplete", autocomplete);

// Place Details
router.get("/details", placeDetails);
router.get("/place-details", placeDetails);
router.post("/details", placeDetails);

// Distance Matrix (Supports both GET & POST and both route names)
router.get("/distance", calculateDistance);
router.post("/distance", calculateDistance);
router.get("/distance-calculate", calculateDistance);
router.post("/distance-calculate", calculateDistance);

export default router;
