import express from "express";
import {
  calculateFare,
  createRazorpayOrder,
  verifyPaymentAndBook,
  getMyBookings,
  getBookingDetails,
  cancelBooking,
  processRefund,
  getAllBookings,
  getRefundReport,
} from "../controllers/bookingController.js";
import { validate } from "../middleware/validate.js";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import {
  createOrderSchema,
  verifyPaymentSchema,
  cancelBookingSchema,
  refundBookingSchema,
  calculateFareSchema,
} from "../validators/bookingValidators.js";

const router = express.Router();

// Fare Calculation & Pricing Engine
router.get("/calculate-fare", calculateFare);
router.post("/calculate-fare", validate(calculateFareSchema), calculateFare);

// Public / Authenticated Razorpay Order creation
router.post("/create-order", validate(createOrderSchema), createRazorpayOrder);
router.post("/verify-payment", validate(verifyPaymentSchema), verifyPaymentAndBook);

// User Booking Operations
router.get("/my-bookings", authMiddleware, getMyBookings);
router.get("/user/:userId", authMiddleware, getMyBookings);
router.get("/details/:id", authMiddleware, getBookingDetails);
router.get("/:id", authMiddleware, getBookingDetails);

// Booking Cancellation & Refund
router.post("/:id/cancel", authMiddleware, validate(cancelBookingSchema), cancelBooking);
router.post("/cancel-booking", authMiddleware, validate(cancelBookingSchema), cancelBooking);
router.post("/cancel", authMiddleware, validate(cancelBookingSchema), cancelBooking);

// Admin-Triggered Instant / Custom Refund
router.post("/:id/refund", authMiddleware, adminMiddleware, validate(refundBookingSchema), processRefund);
router.post("/refund-payment", authMiddleware, adminMiddleware, validate(refundBookingSchema), processRefund);
router.post("/refund", authMiddleware, adminMiddleware, validate(refundBookingSchema), processRefund);

// Admin Get All Bookings & Refund Report
router.get("/admin/all", authMiddleware, adminMiddleware, getAllBookings);
router.get("/admin/refund-report", authMiddleware, adminMiddleware, getRefundReport);
router.get("/refund-report", authMiddleware, adminMiddleware, getRefundReport);

export default router;
