import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import Vehicle from "../models/Vehicle.js";
import BookingPayment from "../models/BookingPayment.js";
import {authMiddleware}  from "../middleware/auth.js";

dotenv.config();

const router = express.Router();
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// Utility for consistent responses
const sendResponse = (res, status, success, message, data = null) => {
  return res.status(status).json({ success, message, data });
};

// Configure Nodemailer (Gmail example)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Utility to generate unique booking code
const generateBookingCode = () => {
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const dateStr = new Date().toISOString().replace(/[-:.TZ]/g, "").substring(0, 14);
  return `${randomStr}-${dateStr}`;
};

// ----------------------
// POST /api/payments/create-order
// ----------------------
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { vehicleId, amount, origin, destination, startDate, endDate, isRoundTrip } = req.body;

    if (!isValidObjectId(vehicleId))
      return sendResponse(res, 400, false, "Invalid vehicle ID");

    if (!amount || amount <= 0)
      return sendResponse(res, 400, false, "Invalid amount");

    if (!origin || !destination)
      return sendResponse(res, 400, false, "Origin and destination are required");

    if (!startDate)
      return sendResponse(res, 400, false, "Start date is required");

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle)
      return sendResponse(res, 404, false, "Vehicle not found");
    
    if (!vehicle.available)
      return sendResponse(res, 400, false, "Vehicle not available");

    const amountInPaise = Math.round(amount * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `booking_${Date.now()}`,
    });

    let bookingPayment = await BookingPayment.findOne({ "payment.orderId": order.id });
    
    if (!bookingPayment) {
      const bookingCode = generateBookingCode();

      bookingPayment = await BookingPayment.create({
        user: req.user._id,
        vehicle: vehicle._id,
        origin: origin.trim(),
        destination: destination.trim(),
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        isRoundTrip: Boolean(isRoundTrip),
        totalPrice: amount,
        bookingCode,
        payment: {
          provider: "razorpay",
          providerPaymentId: order.id,
          orderId: order.id,
          amount,
          currency: "INR",
          status: "pending",
          bookedByName: req.user.name || req.user.email,
        },
        paymentStatus: "Pending",
        status: "Pending",
        bookingStatus: "Pending",
      });

      // Send email to user after booking creation (non-blocking)
     const mailOptions = {
  from: process.env.EMAIL_USER,
  to: req.user.email,
  subject: "Booking Confirmed ✅ - Bhima Cabs",
  html: `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
    <h2 style="color: green; text-align: center;">🎉 Booking Confirmed!</h2>
    <p>Dear <strong>${req.user.name || req.user.email}</strong>,</p>
    <p>We’re happy to let you know that your booking has been <span style="color: green; font-weight: bold;">successfully confirmed</span>. Below are your booking details:</p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Booking Code</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${bookingCode}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Vehicle</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${vehicle.name} (${vehicle.brand})</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Origin</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${origin}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Destination</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${destination}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Start Date</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${new Date(startDate).toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>End Date</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${endDate ? new Date(endDate).toLocaleString() : "N/A"}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Round Trip</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${isRoundTrip ? "Yes" : "No"}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Total Paid</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd; color: green; font-weight: bold;">₹${amount}</td>
      </tr>
      
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Status</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd; color: green; font-weight: bold;">Confirmed</td>
      </tr>
    </table>

    <p style="margin-top: 20px;">Our driver will contact you closer to the pickup time. 🚕</p>

    <p style="margin-top: 20px;">Thank you for trusting <strong>Bhima Cabs</strong> with your travel! We wish you a safe and comfortable journey.</p>

    <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #777;">
      <p>© ${new Date().getFullYear()} Bhima Cabs. All rights reserved.</p>
    </div>
  </div>
  `,
};


      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Email sending error:", error);
        } else {
          console.log("Booking confirmation email sent:", info.response);
        }
      });
    }

    return sendResponse(res, 200, true, "Order created successfully", {
      key: RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: amountInPaise,
      currency: "INR",
      bookingPaymentId: bookingPayment._id,
      bookingCode: bookingPayment.bookingCode,
    });

  } catch (err) {
    console.error("Create order error:", err);
    return sendResponse(res, 500, false, "Failed to create order", { error: err.message });
  }
});

// ----------------------
// POST /api/payments/verify
// ----------------------
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, vehicleId } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature)
      return sendResponse(res, 400, false, "Missing payment details");

    // Verify signature
    const signature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (signature !== razorpay_signature)
      return sendResponse(res, 400, false, "Invalid payment signature");

    const session = await mongoose.startSession();
    
    try {
      const result = await session.withTransaction(async () => {
        // Find booking payment record
        const bookingPayment = await BookingPayment.findOne({ 
          "payment.orderId": razorpay_order_id 
        }).session(session);
        
        if (!bookingPayment) {
          throw new Error("Booking/payment record not found");
        }

        if (bookingPayment.payment.status === "paid") {
          throw new Error("Payment already verified");
        }

        // Verify user ownership
        if (!bookingPayment.user.equals(req.user._id)) {
          throw new Error("Unauthorized: You can only verify your own payments");
        }

        // Check vehicle availability again
        const vehicle = await Vehicle.findById(bookingPayment.vehicle).session(session);
        if (!vehicle) {
          throw new Error("Vehicle not found");
        }
        if (!vehicle.available) {
          throw new Error("Vehicle no longer available");
        }

        // Update payment status first
        bookingPayment.payment.status = "paid";
        bookingPayment.payment.providerPaymentId = razorpay_payment_id;
        bookingPayment.bookingStatus = "Confirmed";
        bookingPayment.paymentStatus = "Paid";
        bookingPayment.status = "Confirmed";
        await bookingPayment.save({ session });

        // Then update vehicle status
        vehicle.available = false;
        vehicle.isBooked = true;
        vehicle.bookedBy = bookingPayment.user;
        vehicle.bookedByName = bookingPayment.payment.bookedByName;
        await vehicle.save({ session });

        return bookingPayment;
      });

      return sendResponse(res, 200, true, "Payment verified and booking confirmed", { 
        bookingPayment: result 
      });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    console.error("Verify payment error:", err);
    return sendResponse(res, 500, false, "Payment verification failed", { error: err.message });
  }
});

// ----------------------
// POST /api/payments/cancel-by-vehicle/:vehicleId
// ----------------------
router.post("/cancel-by-vehicle/:bookingCode", authMiddleware, async (req, res) => {
  try {
    const { bookingCode } = req.params;
    if (!bookingCode) return sendResponse(res, 400, false, "Booking code is required");

    // Find the booking
    const bookingPayment = await BookingPayment.findOne({
      bookingCode: bookingCode.trim(),
      user: req.user._id,
      "payment.status": { $in: ["paid", "pending"] },
      bookingStatus: { $in: ["Pending", "Confirmed"] },
    }).populate("vehicle");

    if (!bookingPayment)
      return sendResponse(res, 404, false, "No active booking found for this code");

    if (bookingPayment.payment.status === "cancelled")
      return sendResponse(res, 400, false, "Booking already cancelled");

    let refundInfo = null;

    // Refund logic (only if payment was successful)
    if (bookingPayment.payment.status === "paid") {
      const now = new Date();
      const createdAt = new Date(bookingPayment.createdAt);
      const hoursDiff = (now - createdAt) / (1000 * 60 * 60);

      if (hoursDiff <= 24) {
        try {
          refundInfo = await razorpay.payments.refund(bookingPayment.payment.providerPaymentId, {
            amount: Math.round(bookingPayment.payment.amount * 100),
            speed: "normal",
            notes: { reason: "User cancelled booking within 24h" },
          });

          bookingPayment.payment.isRefunded = true;
          bookingPayment.payment.refundId = refundInfo.id;
          bookingPayment.paymentStatus = "Refunded";
        } catch (refundErr) {
          console.error("Refund error:", refundErr);
          bookingPayment.payment.failureReason = refundErr.message || "Refund failed";
          await bookingPayment.save();
          return sendResponse(res, 500, false, "Refund failed", { error: refundErr.message });
        }
      } else {
        bookingPayment.payment.failureReason = "Cancellation after 24h, no refund available";
        bookingPayment.paymentStatus = "Failed";
      }
    }

    // Update vehicle availability if vehicle exists
    if (bookingPayment.vehicle) {
      const vehicle = bookingPayment.vehicle;
      vehicle.available = true;
      vehicle.isBooked = false;
      vehicle.bookedBy = null;
      vehicle.bookedByName = null;
      await vehicle.save();
    }





















    // Update booking payment status
    bookingPayment.payment.status = "cancelled";
    bookingPayment.bookingStatus = "Cancelled";
    bookingPayment.status = "Cancelled";
    if (bookingPayment.paymentStatus !== "Refunded") {
      bookingPayment.paymentStatus = "Failed";
    }
    await bookingPayment.save();

try {
  const mailOptions = {
    from: `"Bhima Cabs" <${process.env.EMAIL_USER}>`,
    to: req.user.email,
    subject: `Booking Cancelled: ${bookingPayment.bookingCode}`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background-color: #000000; color: #ffffff; padding: 20px; text-align: center;">
            <h2 style="margin: 0;">Bhima Cabs</h2>
            <p style="margin: 5px 0 0 0; font-size: 14px;">Booking Cancellation Confirmation</p>
          </div>

          <!-- Body -->
          <div style="padding: 20px; color: #333333;">
            <p>Hi <b>${req.user.name}</b>,</p>
            <p>Your booking has been successfully <span style="color: #e74c3c; font-weight: bold;">cancelled</span>.</p>

            <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 5px; font-size: 16px;">Booking Details</h3>
            <ul style="list-style: none; padding: 0; line-height: 1.6;">
              <li><strong>Booking Code:</strong> ${bookingPayment.bookingCode}</li>
              <li><strong>Vehicle:</strong> ${bookingPayment.vehicle?.name || "N/A"}</li>
              <li><strong>Origin:</strong> ${bookingPayment.origin}</li>
              <li><strong>Destination:</strong> ${bookingPayment.destination}</li>
              <li><strong>Start:</strong> ${bookingPayment.startDate}</li>
              <li><strong>End:</strong> ${bookingPayment.endDate}</li>
              <li><strong>Refund Status:</strong> ${refundInfo ? "Initiated" : "Not applicable"}</li>
            </ul>

            <p style="margin-top: 20px;">Thank you for choosing <b>Bhima Cabs</b>. We hope to serve you again soon!</p>

            <p style="font-size: 12px; color: #888888; margin-top: 30px;">
              This is an automated message. Please do not reply.
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f4f4f4; text-align: center; padding: 10px; font-size: 12px; color: #777;">
            &copy; ${new Date().getFullYear()} Bhima Cabs. All rights reserved.
          </div>

        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log("Cancellation email sent successfully");
} catch (emailErr) {
  console.error("Failed to send cancellation email:", emailErr);
}


    return sendResponse(res, 200, true, "Booking cancelled successfully", {
      bookingPayment,
      refund: refundInfo,
      message: refundInfo ? "Refund initiated successfully" : "Booking cancelled (no refund applicable)"
    });

  } catch (err) {
    console.error("Cancel by bookingCode error:", err);
    return sendResponse(res, 500, false, "Failed to cancel booking", { error: err.message });
  }
});



// ----------------------
// GET /api/payments/booking/:bookingId
// ----------------------
router.get("/booking/:bookingId", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!isValidObjectId(bookingId))
      return sendResponse(res, 400, false, "Invalid booking ID");

    const booking = await BookingPayment.findById(bookingId)
      .populate('vehicle')
      .populate('user', 'name email');

    if (!booking) 
      return sendResponse(res, 404, false, "Booking not found");

    // Check if user owns this booking
    if (!booking.user._id.equals(req.user._id))
      return sendResponse(res, 403, false, "Unauthorized: You can only view your own bookings");

    return sendResponse(res, 200, true, "Booking retrieved successfully", { booking });
  } catch (err) {
    console.error("Get booking error:", err);
    return sendResponse(res, 500, false, "Failed to retrieve booking", { error: err.message });
  }
});

// ----------------------
// GET /api/payments/user-bookings
// ----------------------
router.get("/user-bookings", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (status) {
      filter.bookingStatus = status;
    }

    const bookings = await BookingPayment.find(filter)
      .populate('vehicle')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await BookingPayment.countDocuments(filter);

    return sendResponse(res, 200, true, "User bookings retrieved successfully", {
      bookings,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (err) {
    console.error("Get user bookings error:", err);
    return sendResponse(res, 500, false, "Failed to retrieve user bookings", { error: err.message });
  }
});

export default router;