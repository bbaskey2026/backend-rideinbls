import express from "express";
import {
  getDashboardStats,
  getAllUsers,
  toggleUserStatus,
  deleteUser,
} from "../controllers/adminController.js";
import { getAllBookings, processRefund, getRefundReport } from "../controllers/bookingController.js";
import { getAllDrivers } from "../controllers/driverController.js";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { refundBookingSchema } from "../validators/bookingValidators.js";

const router = express.Router();

// Apply auth and admin check to all admin routes
router.use(authMiddleware, adminMiddleware);

// Analytics / Dashboard
router.get("/dashboard-stats", getDashboardStats);
router.get("/stats", getDashboardStats);
router.get("/refund-report", getRefundReport);

// User Management
router.get("/users", getAllUsers);
router.patch("/users/:id/status", toggleUserStatus);
router.delete("/users/:id", deleteUser);

// Booking Oversight
router.get("/bookings", getAllBookings);
router.get("/refunds", getRefundReport);
router.post("/bookings/:id/refund", validate(refundBookingSchema), processRefund);

// Driver Oversight
router.get("/drivers", getAllDrivers);

export default router;
