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
const transporter = nodemailer.createTransport({  // ✅ createTransport (not createTransporter)
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
  return `BLS${randomStr}${dateStr}`;
};

// ----------------------
// POST /api/payments/create-order - ONLY CREATE RAZORPAY ORDER
// ----------------------
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { vehicleId, amount, origin, destination, startDate, endDate, isRoundTrip } = req.body;

    // Basic validation
    if (!isValidObjectId(vehicleId))
      return sendResponse(res, 400, false, "Invalid vehicle ID");

    if (!amount || amount <= 0)
      return sendResponse(res, 400, false, "Invalid amount");

    if (!origin || !destination)
      return sendResponse(res, 400, false, "Origin and destination are required");

    // Enhanced date validation
    const hasStartDate = startDate && startDate.trim() !== "" && startDate !== "null" && startDate !== "undefined";
    const hasEndDate = endDate && endDate.trim() !== "" && endDate !== "null" && endDate !== "undefined";

    // Process dates based on what's provided
    let processedStartDate = null;
    let processedEndDate = null;
    let bookingType = "immediate";

    if (!hasStartDate && !hasEndDate) {
      // Immediate booking - set current time
      processedStartDate = new Date();
      processedEndDate = null;
      bookingType = "immediate";
    }
    else if (hasStartDate && hasEndDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const now = new Date();

      // Validate date objects
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return sendResponse(res, 400, false, "Invalid date format");
      }

      // Check if dates are not from 1970
      if (start.getFullYear() < 2020 || end.getFullYear() < 2020) {
        return sendResponse(res, 400, false, "Invalid date - dates appear to be incorrect");
      }

      // Check if start time is in the future (5 minute buffer)
      const minStartTime = new Date(now.getTime() + 5 * 60 * 1000);
      if (start < minStartTime) {
        return sendResponse(res, 400, false, "Start time must be at least 5 minutes in the future");
      }

      // Check if end time is after start time
      if (end <= start) {
        return sendResponse(res, 400, false, "End time must be after start time");
      }

      // Check minimum duration (1 hour)
      const durationInHours = (end - start) / (1000 * 60 * 60);
      if (durationInHours < 1) {
        return sendResponse(res, 400, false, "Minimum booking duration is 1 hour");
      }

      // Check maximum duration (30 days)
      if (durationInHours > 720) {
        return sendResponse(res, 400, false, "Maximum booking duration is 30 days");
      }

      processedStartDate = start;
      processedEndDate = end;
      bookingType = "scheduled";
    }
    else {
      // Only one date provided - error
      return sendResponse(res, 400, false, "Please provide both start and end dates or leave both empty for immediate booking");
    }

    // Verify vehicle exists and is available
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return sendResponse(res, 404, false, "Vehicle not found");
    }
    
    if (!vehicle.isAvailable && !vehicle.available) {
      return sendResponse(res, 400, false, "Vehicle is not available for booking");
    }

    // For scheduled bookings, check for conflicts
    if (bookingType === "scheduled") {
      const conflictingBooking = await BookingPayment.findOne({
        vehicle: vehicleId,
        status: { $in: ['Pending', 'Confirmed'] },
        $or: [
          {
            startDate: { $lte: processedStartDate },
            endDate: { $gte: processedStartDate }
          },
          {
            startDate: { $lte: processedEndDate },
            endDate: { $gte: processedEndDate }
          },
          {
            startDate: { $gte: processedStartDate },
            endDate: { $lte: processedEndDate }
          }
        ]
      });

      if (conflictingBooking) {
        return sendResponse(res, 400, false, "Vehicle is already booked for the selected time period");
      }
    }

    // Generate booking code for order receipt
    const bookingCode = generateBookingCode();
    const amountInPaise = Math.round(amount * 100);

    // Create Razorpay order with booking metadata
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: bookingCode,
      notes: {
        vehicleId,
        userId: req.user._id.toString(),
        origin: origin.trim(),
        destination: destination.trim(),
        startDate: processedStartDate ? processedStartDate.toISOString() : null,
        endDate: processedEndDate ? processedEndDate.toISOString() : null,
        isRoundTrip: Boolean(isRoundTrip),
        bookingType,
        bookingCode
      }
    });

    // Return order details for payment - NO BOOKING CREATED YET
    return sendResponse(res, 200, true, "Payment order created successfully", {
      key: RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: amountInPaise,
      currency: "INR",
      bookingCode: bookingCode,
      vehicleInfo: {
        name: vehicle.name,
        brand: vehicle.brand,
        type: vehicle.type
      },
      bookingType,
      message: bookingType === "immediate" 
        ? "Complete payment to confirm immediate booking"
        : `Complete payment to confirm scheduled booking for ${processedStartDate.toLocaleString()}`
    });

  } catch (err) {
    console.error("Create order error:", err);
    return sendResponse(res, 500, false, "Failed to create payment order", { error: err.message });
  }
});

// ----------------------
// POST /api/payments/verify - CREATE BOOKING AFTER PAYMENT SUCCESS
// ----------------------
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature)
      return sendResponse(res, 400, false, "Missing payment details");

    // Verify signature
    const signature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (signature !== razorpay_signature)
      return sendResponse(res, 400, false, "Invalid payment signature");

    // Get order details from Razorpay
    const orderDetails = await razorpay.orders.fetch(razorpay_order_id);
    if (!orderDetails) {
      return sendResponse(res, 404, false, "Order not found");
    }

    // Extract booking data from order notes
    const { 
      vehicleId, 
      userId, 
      origin, 
      destination, 
      startDate, 
      endDate, 
      isRoundTrip, 
      bookingType,
      bookingCode 
    } = orderDetails.notes;

    // Verify user matches
    if (userId !== req.user._id.toString()) {
      return sendResponse(res, 403, false, "Unauthorized payment verification");
    }

    const session = await mongoose.startSession();
    
    try {
      const result = await session.withTransaction(async () => {
        // Check if booking already exists (prevent duplicate creation)
        const existingBooking = await BookingPayment.findOne({ 
          bookingCode: bookingCode 
        }).session(session);
        
        if (existingBooking) {
          if (existingBooking.payment.status === "paid") {
            return existingBooking; // Already processed
          }
          throw new Error("Booking exists but payment not completed");
        }

        // Verify vehicle is still available
        const vehicle = await Vehicle.findById(vehicleId).session(session);
        if (!vehicle) {
          throw new Error("Vehicle not found");
        }
        if (!vehicle.isAvailable && !vehicle.available) {
          throw new Error("Vehicle no longer available");
        }

        // For scheduled bookings, check conflicts again
        if (bookingType === "scheduled") {
          const conflictingBooking = await BookingPayment.findOne({
            vehicle: vehicleId,
            status: { $in: ['Pending', 'Confirmed'] },
            $or: [
              {
                startDate: { $lte: new Date(startDate) },
                endDate: { $gte: new Date(startDate) }
              },
              {
                startDate: { $lte: new Date(endDate) },
                endDate: { $gte: new Date(endDate) }
              }
            ]
          }).session(session);

          if (conflictingBooking) {
            throw new Error("Vehicle has been booked by someone else during payment process");
          }
        }

        // NOW CREATE THE BOOKING (after successful payment)
        const bookingPayment = await BookingPayment.create([{
          user: req.user._id,
          vehicle: vehicleId,
          origin: origin,
          destination: destination,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : null,
          isRoundTrip: Boolean(isRoundTrip),
          totalPrice: orderDetails.amount / 100,
          bookingCode: bookingCode,
          bookingType: bookingType,
          payment: {
            provider: "razorpay",
            providerPaymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
            amount: orderDetails.amount / 100,
            currency: "INR",
            status: "paid",
            bookedByName: req.user.name || req.user.email,
          },
          paymentStatus: "Paid",
          status: "Confirmed",
          bookingStatus: "Confirmed",
        }], { session });

        // Update vehicle status for immediate bookings or close scheduled bookings
        if (bookingType === "immediate") {
          vehicle.isAvailable = false;
          vehicle.available = false;
          vehicle.isBooked = true;
          vehicle.bookedBy = req.user._id;
          vehicle.bookedByName = req.user.name || req.user.email;
          await vehicle.save({ session });
        }
        // For scheduled bookings, we might keep vehicle available until booking starts

        await bookingPayment[0].populate([
          { path: 'vehicle', select: 'name brand type licensePlate images pricePerDay' },
          { path: 'user', select: 'name email phone' }
        ]);

        return bookingPayment[0];
      });

      // Send confirmation email AFTER successful booking creation
      try {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: req.user.email,
          subject: "Booking Confirmed - BlsRide",
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
              <h2 style="color: green; text-align: center;">🎉 Booking Confirmed!</h2>
              <p>Dear <strong>${req.user.name || req.user.email}</strong>,</p>
              <p>Your payment was successful and booking has been <span style="color: green; font-weight: bold;">confirmed</span>!</p>

              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Booking Code</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${result.bookingCode}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Vehicle</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${result.vehicle.name} (${result.vehicle.brand})</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Origin</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${result.origin}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Destination</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${result.destination}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Start Date</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${result.startDate.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>End Date</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${result.endDate ? result.endDate.toLocaleString() : "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Total Paid</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd; color: green; font-weight: bold;">₹${result.payment.amount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Payment ID</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${razorpay_payment_id}</td>
                </tr>
              </table>

              <p style="margin-top: 20px;">${result.bookingType === "immediate" 
                ? "Our driver will contact you shortly for immediate pickup! 🚗" 
                : "Our driver will contact you closer to the scheduled pickup time. 🚗"}</p>

              <p style="margin-top: 20px;">Thank you for choosing <strong>BlsRide</strong>!</p>

              <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #777;">
                <p>© ${new Date().getFullYear()} BlsRide. All rights reserved.</p>
              </div>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log("Booking confirmation email sent successfully");
      } catch (emailError) {
        console.error("Email sending error:", emailError);
        // Don't fail the entire transaction for email issues
      }

      return sendResponse(res, 200, true, "Payment verified and booking confirmed successfully", { 
        booking: result,
        message: result.bookingType === "immediate" 
          ? "Immediate booking confirmed - driver will contact you shortly"
          : "Scheduled booking confirmed - you will be contacted before pickup time"
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
// POST /api/payments/cancel-by-vehicle/:bookingCode
// ----------------------
router.post("/cancel-by-vehicle/:bookingCode", authMiddleware, async (req, res) => {
  try {
    const { bookingCode } = req.params;
    if (!bookingCode) return sendResponse(res, 400, false, "Booking code is required");

    // Find the booking
    const bookingPayment = await BookingPayment.findOne({
      bookingCode: bookingCode.trim(),
      user: req.user._id,
      "payment.status": "paid", // Only allow cancellation of paid bookings
      bookingStatus: { $in: ["Pending", "Confirmed"] },
    }).populate("vehicle");

    if (!bookingPayment)
      return sendResponse(res, 404, false, "No active paid booking found for this code");

    if (bookingPayment.bookingStatus === "Cancelled")
      return sendResponse(res, 400, false, "Booking already cancelled");

    let refundInfo = null;
    const now = new Date();
    const createdAt = new Date(bookingPayment.createdAt);
    const hoursDiff = (now - createdAt) / (1000 * 60 * 60);

    // Refund logic for paid bookings
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

        // Send refund success email
        const refundMailOptions = {
  from: `"RideInBalasore" <${process.env.EMAIL_USER}>`,
  to: req.user.email,
  subject: `Refund Successful: ${bookingPayment.bookingCode}`,
  html: `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Refund Successful - RideInBalasore</title>
        <style>
          /* Mobile responsive adjustments */
          @media only screen and (max-width: 600px) {
            .container { padding: 15px !important; }
            h2 { font-size: 22px !important; }
            p, td { font-size: 14px !important; }
          }
        </style>
      </head>
      <body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color:#f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 0; background-color:#f4f4f4;">
          <tr>
            <td>
              <table class="container" width="100%" style="max-width:600px; margin: auto; background-color:#ffffff; border-radius:10px; padding:20px; box-shadow:0 4px 8px rgba(0,0,0,0.1);">
                
                <!-- Header -->
                <tr>
                  <td style="text-align:center; padding-bottom:20px;">
                    <h2 style="color:green; margin:0; font-size:24px;">💰 Refund Successful!</h2>
                  </td>
                </tr>

                <!-- Greeting -->
                <tr>
                  <td>
                    <p>Hi <b>${req.user.name || req.user.email}</b>,</p>
                    <p>Your booking <b>${bookingPayment.bookingCode}</b> has been cancelled and the refund amount has been successfully credited to your original payment method.</p>
                  </td>
                </tr>

                <!-- Booking Details Table -->
                <tr>
                  <td>
                    <table style="width:100%; border-collapse: collapse; margin-top:20px;">
                      <tr>
                        <td style="padding:8px; border:1px solid #ddd;"><strong>Booking Code</strong></td>
                        <td style="padding:8px; border:1px solid #ddd;">${bookingPayment.bookingCode}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px; border:1px solid #ddd;"><strong>Vehicle</strong></td>
                        <td style="padding:8px; border:1px solid #ddd;">${bookingPayment.vehicle?.name || "N/A"}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px; border:1px solid #ddd;"><strong>Refund Amount</strong></td>
                        <td style="padding:8px; border:1px solid #ddd; color:green; font-weight:bold;">₹${bookingPayment.payment.amount}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px; border:1px solid #ddd;"><strong>Refund Transaction ID</strong></td>
                        <td style="padding:8px; border:1px solid #ddd;">${refundInfo.id}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Closing -->
                <tr>
                  <td style="padding-top:20px;">
                    <p>Thank you for choosing <b>RideInBalasore</b>. We hope to serve you again soon!</p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="text-align:center; padding-top:30px; font-size:12px; color:#777;">
                    &copy; ${new Date().getFullYear()} RideInBalasore. All rights reserved.
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `,
};


        await transporter.sendMail(refundMailOptions);
        console.log("Refund success email sent successfully");

      } catch (refundErr) {
        console.error("Refund error:", refundErr);
        return sendResponse(res, 500, false, "Refund failed", { error: refundErr.message });
      }
    } else {
      bookingPayment.payment.failureReason = "Cancellation after 24h, no refund available";
    }

    // Update vehicle availability
    if (bookingPayment.vehicle) {
      const vehicle = bookingPayment.vehicle;
      vehicle.isAvailable = true;
      vehicle.available = true;
      vehicle.isBooked = false;
      vehicle.bookedBy = null;
      vehicle.bookedByName = null;
      await vehicle.save();
    }

    // Update booking status
    bookingPayment.bookingStatus = "Cancelled";
    bookingPayment.status = "Cancelled";
    if (!refundInfo) {
      bookingPayment.paymentStatus = "No Refund";
    }
    await bookingPayment.save();

    // Send cancellation email
    try {
      const mailOptions = {
  from: `"RideInBalasore" <${process.env.EMAIL_USER}>`,
  to: req.user.email,
  subject: `Booking Cancelled: ${bookingPayment.bookingCode}`,
  html: `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Booking Cancelled - RideInBalasore</title>
        <style>
          @media only screen and (max-width: 600px) {
            .container { padding: 15px !important; }
            h2 { font-size: 22px !important; }
            p, td { font-size: 14px !important; }
          }
        </style>
      </head>
      <body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color:#f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 0; background-color:#f4f4f4;">
          <tr>
            <td>
              <table class="container" width="100%" style="max-width:600px; margin:auto; background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 8px rgba(0,0,0,0.1);">

                <!-- Header -->
                <tr>
                  <td style="background-color:#000000; color:#ffffff; padding:20px; text-align:center;">
                    <h2 style="margin:0;">RideInBalasore</h2>
                    <p style="margin:5px 0 0 0; font-size:14px;">Booking Cancellation Confirmation</p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:20px; color:#333;">
                    <p>Hi <b>${req.user.name || req.user.email}</b>,</p>
                    <p>Your booking has been successfully <span style="color:#e74c3c; font-weight:bold;">cancelled</span>.</p>

                    <h3 style="border-bottom:1px solid #ddd; padding-bottom:5px; font-size:16px;">Booking Details</h3>
                    <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse; margin-top:10px;">
                      <tr>
                        <td style="border:1px solid #ddd;"><strong>Booking Code</strong></td>
                        <td style="border:1px solid #ddd;">${bookingPayment.bookingCode}</td>
                      </tr>
                      <tr>
                        <td style="border:1px solid #ddd;"><strong>Vehicle</strong></td>
                        <td style="border:1px solid #ddd;">${bookingPayment.vehicle?.name || "N/A"}</td>
                      </tr>
                      <tr>
                        <td style="border:1px solid #ddd;"><strong>Origin</strong></td>
                        <td style="border:1px solid #ddd;">${bookingPayment.origin}</td>
                      </tr>
                      <tr>
                        <td style="border:1px solid #ddd;"><strong>Destination</strong></td>
                        <td style="border:1px solid #ddd;">${bookingPayment.destination}</td>
                      </tr>
                      <tr>
                        <td style="border:1px solid #ddd;"><strong>Start</strong></td>
                        <td style="border:1px solid #ddd;">${bookingPayment.startDate}</td>
                      </tr>
                      <tr>
                        <td style="border:1px solid #ddd;"><strong>End</strong></td>
                        <td style="border:1px solid #ddd;">${bookingPayment.endDate}</td>
                      </tr>
                      <tr>
                        <td style="border:1px solid #ddd;"><strong>Refund Status</strong></td>
                        <td style="border:1px solid #ddd;">${refundInfo ? "Initiated" : "Not applicable"}</td>
                      </tr>
                    </table>

                    <p style="margin-top:20px;">Thank you for choosing <b>RideInBalasore</b>. We hope to serve you again soon!</p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color:#f4f4f4; text-align:center; padding:15px; font-size:12px; color:#777;">
                    &copy; ${new Date().getFullYear()} RideInBalasore. All rights reserved.
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
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
router.get("/user-bookings", authMiddleware,async (req, res) => {
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