import express from "express";
import {
  registerDriver,
  getAllDrivers,
  getDriverById,
  updateDriver,
  deleteDriver,
} from "../controllers/driverController.js";
import { validate } from "../middleware/validate.js";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { driverRegistrationSchema } from "../validators/driverValidators.js";

const router = express.Router();

// Public driver application
router.post("/register", validate(driverRegistrationSchema), registerDriver);
router.post("/apply", validate(driverRegistrationSchema), registerDriver);

// Admin driver management
router.get("/", authMiddleware, adminMiddleware, getAllDrivers);
router.get("/:id", authMiddleware, adminMiddleware, getDriverById);
router.put("/:id", authMiddleware, adminMiddleware, updateDriver);
router.delete("/:id", authMiddleware, adminMiddleware, deleteDriver);

export default router;