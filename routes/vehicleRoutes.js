import express from "express";
import {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getAvailableVehicles,
} from "../controllers/vehicleController.js";
import { validate } from "../middleware/validate.js";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import {
  createVehicleSchema,
  updateVehicleSchema,
} from "../validators/vehicleValidators.js";

const router = express.Router();

// Public Vehicle Discovery
router.get("/", getAllVehicles);
router.get("/available", getAvailableVehicles);
router.get("/:id", getVehicleById);

// Admin Vehicle Management
router.post("/", authMiddleware, adminMiddleware, validate(createVehicleSchema), createVehicle);
router.put("/:id", authMiddleware, adminMiddleware, validate(updateVehicleSchema), updateVehicle);
router.delete("/:id", authMiddleware, adminMiddleware, deleteVehicle);

export default router;
