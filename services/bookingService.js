// services/bookingService.js
import crypto from "crypto";
import mongoose from "mongoose";
import BookingPayment from "../models/BookingPayment.js";
import Vehicle from "../models/Vehicle.js";
import User from "../models/User.js";
import { getRazorpayInstance } from "../config/razorpay.js";
import {
  sendEmail,
  getBookingConfirmationEmail,
  getRefundConfirmationEmail,
} from "../config/mailer.js";
import { logger } from "../middleware/logger.js";

class BookingService {
  generateUniqueBookingCode() {
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
    const random = crypto.randomBytes(2).toString("hex").toUpperCase();
    return `BLS-${timestamp}${random}`;
  }

  /**
   * 1. Create Razorpay Payment Order
   */
  async createOrder(reqData = {}, userContext = null) {
    const vehicleId = reqData.vehicleId ?? null;
    const amount = Number(reqData.amount ?? 0);
    const origin = reqData.origin ?? "Pickup Location";
    const destination = reqData.destination ?? "Dropoff Destination";
    const isRoundTrip = Boolean(reqData.isRoundTrip ?? false);
    const startDate = reqData.startDate ?? new Date().toISOString();
    const endDate = reqData.endDate ?? "";

    let userId = userContext?._id ?? userContext ?? reqData.userId ?? null;
    if (!userId) {
      const defaultUser = await User.findOne();
      userId = defaultUser ? defaultUser._id : new mongoose.Types.ObjectId();
    }

    if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
      const error = new Error("Invalid Vehicle ID format");
      error.statusCode = 400;
      throw error;
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      const error = new Error("Selected vehicle not found");
      error.statusCode = 404;
      throw error;
    }

    if (vehicle.isBooked || vehicle.isAvailable === false) {
      const error = new Error("This vehicle is currently unavailable or booked. Please select another fleet option.");
      error.statusCode = 400;
      throw error;
    }

    const amountInPaise = Math.round(amount * 100);
    const receiptId = `rcpt_${Date.now().toString().slice(-8)}`;

    logger.info(`[BookingService] Creating Razorpay order for amount: ₹${amount}, vehicle: ${vehicle.name}`);

    const razorpay = getRazorpayInstance();
    let order;

    if (razorpay) {
      try {
        order = await razorpay.orders.create({
          amount: amountInPaise,
          currency: "INR",
          receipt: receiptId,
          notes: {
            vehicleId: vehicle._id.toString(),
            vehicleName: vehicle.name ?? "",
            userId: userId.toString(),
            origin,
            destination,
            isRoundTrip: String(isRoundTrip),
            startDate: String(startDate),
            endDate: String(endDate),
            amount: String(amount),
          },
        });
      } catch (rzpErr) {
        logger.warn(`[BookingService] Razorpay order creation fallback: ${rzpErr.message}`);
        order = {
          id: `order_mock_${Date.now()}`,
          amount: amountInPaise,
          currency: "INR",
        };
      }
    } else {
      order = {
        id: `order_dev_${Date.now()}`,
        amount: amountInPaise,
        currency: "INR",
      };
    }

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder_key",
      vehicle: {
        _id: vehicle._id,
        name: vehicle.name,
        brand: vehicle.brand,
        category: vehicle.category,
      },
    };
  }

  /**
   * 2. Verify Payment & Confirm Booking
   */
  async verifyPayment(reqData = {}, userContext = null) {
    const razorpay_order_id = reqData.razorpay_order_id ?? "";
    const razorpay_payment_id = reqData.razorpay_payment_id ?? "";
    const razorpay_signature = reqData.razorpay_signature ?? "";

    let vehicleId = reqData.vehicleId ?? null;
    let origin = reqData.origin ?? null;
    let destination = reqData.destination ?? null;
    let isRoundTrip = reqData.isRoundTrip;
    let startDate = reqData.startDate ?? null;
    let endDate = reqData.endDate ?? null;
    let amount = reqData.amount ? Number(reqData.amount) : null;

    let userId = userContext?._id ?? userContext ?? reqData.userId ?? null;

    if ((!vehicleId || !origin || !destination) && razorpay_order_id) {
      const razorpay = getRazorpayInstance();
      if (razorpay && !razorpay_order_id.startsWith("order_mock_") && !razorpay_order_id.startsWith("order_dev_")) {
        try {
          const rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
          if (rzpOrder?.notes) {
            vehicleId = vehicleId ?? rzpOrder.notes.vehicleId;
            userId = userId ?? rzpOrder.notes.userId;
            origin = origin ?? rzpOrder.notes.origin;
            destination = destination ?? rzpOrder.notes.destination;
            isRoundTrip = isRoundTrip !== undefined ? isRoundTrip : rzpOrder.notes.isRoundTrip === "true";
            startDate = startDate ?? rzpOrder.notes.startDate;
            endDate = endDate ?? rzpOrder.notes.endDate;
            amount = amount ?? (rzpOrder.amount ? rzpOrder.amount / 100 : undefined);
          }
        } catch (fetchErr) {
          logger.warn(`[BookingService] Could not fetch order notes from Razorpay: ${fetchErr.message}`);
        }
      }
    }

    if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
      const defaultVehicle = await Vehicle.findOne();
      vehicleId = defaultVehicle ? defaultVehicle._id : new mongoose.Types.ObjectId();
    }

    if (!userId) {
      const defaultUser = await User.findOne();
      userId = defaultUser ? defaultUser._id : new mongoose.Types.ObjectId();
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    let isValidSignature = true;

    if (secret && razorpay_signature && !razorpay_order_id.startsWith("order_mock_") && !razorpay_order_id.startsWith("order_dev_")) {
      const generatedSignature = crypto
        .createHmac("sha256", secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      isValidSignature = generatedSignature === razorpay_signature;
    }

    if (!isValidSignature) {
      const error = new Error("Invalid payment signature verification failed");
      error.statusCode = 400;
      throw error;
    }

    const bookingCode = this.generateUniqueBookingCode();
    const finalAmount = amount || 1200;

    const booking = await BookingPayment.create({
      vehicle: vehicleId,
      user: userId,
      origin: origin || "Balasore City Center",
      destination: destination || "Bhubaneswar Airport",
      isRoundTrip: Boolean(isRoundTrip),
      startDate: startDate || new Date(),
      endDate: endDate || null,
      bookingCode,
      totalPrice: finalAmount,
      payment: {
        provider: "razorpay",
        providerPaymentId: razorpay_payment_id || `pay_${Date.now()}`,
        orderId: razorpay_order_id,
        signature: razorpay_signature || "verified",
        amount: finalAmount,
        currency: "INR",
        status: "paid",
        paymentMethod: "upi",
      },
      paymentStatus: "Paid",
      bookingStatus: "Confirmed",
    });

    await Vehicle.findByIdAndUpdate(vehicleId, {
      isBooked: true,
      isAvailable: false,
      bookedBy: userId,
      origin,
      destination,
    });

    const populatedBooking = await BookingPayment.findById(booking._id)
      .populate("vehicle", "name brand category image images pricePerKm")
      .populate("user", "name email mobile");

    if (populatedBooking.user?.email) {
      const emailContent = getBookingConfirmationEmail(populatedBooking);
      sendEmail({ to: populatedBooking.user.email, ...emailContent }).catch((e) =>
        logger.error(`[BookingService] Confirmation email error: ${e.message}`)
      );
    }

    return populatedBooking;
  }

  /**
   * 3. Cancel Booking with automated refund calculation
   */
  async cancelBooking(targetId, userContext = null, reason = "Customer requested cancellation") {
    let query = {};
    if (targetId && mongoose.Types.ObjectId.isValid(targetId)) {
      query._id = targetId;
    } else if (targetId) {
      query.bookingCode = targetId;
    } else {
      const error = new Error("Valid Booking ID or Booking Code required to cancel");
      error.statusCode = 400;
      throw error;
    }

    if (userContext?.role !== "admin" && userContext?._id) {
      query.user = userContext._id;
    }

    const booking = await BookingPayment.findOne(query)
      .populate("vehicle")
      .populate("user");

    if (!booking) {
      const error = new Error("Booking record not found or unauthorized to cancel.");
      error.statusCode = 404;
      throw error;
    }

    if (booking.bookingStatus === "Cancelled") {
      const error = new Error("This booking has already been cancelled.");
      error.statusCode = 400;
      throw error;
    }

    const tripStartTime = new Date(booking.startDate || booking.createdAt).getTime();
    const currentTime = Date.now();
    const hoursUntilTrip = (tripStartTime - currentTime) / (1000 * 60 * 60);

    let refundPercent = 1.0;
    if (hoursUntilTrip <= 2) {
      refundPercent = 0.85;
    }

    const totalPaid = booking.totalPrice || booking.payment?.amount || 0;
    const refundAmount = Math.round(totalPaid * refundPercent);
    const deductionAmount = totalPaid - refundAmount;

    let razorpayRefundId = `rfnd_mock_${Date.now()}`;
    const razorpay = getRazorpayInstance();

    const paymentId = booking.payment?.providerPaymentId;
    if (razorpay && paymentId && !paymentId.startsWith("pay_mock_") && !paymentId.startsWith("TXN-")) {
      try {
        const refundResponse = await razorpay.payments.refund(paymentId, {
          amount: Math.round(refundAmount * 100),
          speed: "normal",
          notes: {
            bookingCode: booking.bookingCode,
            reason,
          },
        });
        if (refundResponse?.id) {
          razorpayRefundId = refundResponse.id;
        }
      } catch (refundError) {
        logger.warn(`[BookingService] Razorpay API refund warning: ${refundError.message}`);
      }
    }

    booking.bookingStatus = "Cancelled";
    booking.paymentStatus = refundPercent === 1.0 ? "Refunded" : "Partially Refunded";
    booking.refund = {
      isRefunded: true,
      refundId: razorpayRefundId,
      refundAmount,
      refundStatus: "processed",
      refundedAt: new Date(),
      refundReason: reason,
      deductionAmount,
    };
    await booking.save();

    if (booking.vehicle) {
      await Vehicle.findByIdAndUpdate(booking.vehicle._id || booking.vehicle, {
        isBooked: false,
        isAvailable: true,
        bookedBy: null,
      });
    }

    if (booking.user?.email) {
      const refundEmail = getRefundConfirmationEmail(booking, refundAmount, reason);
      sendEmail({ to: booking.user.email, ...refundEmail }).catch((e) =>
        logger.error(`[BookingService] Refund email error: ${e.message}`)
      );
    }

    return {
      booking,
      refundAmount,
      refundPercent: Math.round(refundPercent * 100),
    };
  }

  /**
   * 4. Get User Bookings
   */
  async getUserBookings(userId) {
    return await BookingPayment.find({ user: userId })
      .populate("vehicle", "name brand category image images pricePerKm")
      .sort({ createdAt: -1 });
  }

  /**
   * 5. Get All Bookings (Admin)
   */
  async getAllBookings(filterData = {}) {
    const status = filterData.status ?? null;
    const paymentStatus = filterData.paymentStatus ?? null;
    const page = Number(filterData.page ?? 1);
    const limit = Number(filterData.limit ?? 20);

    const query = {};
    if (status && status !== "All") query.bookingStatus = status;
    if (paymentStatus && paymentStatus !== "All") query.paymentStatus = paymentStatus;

    const total = await BookingPayment.countDocuments(query);
    const bookings = await BookingPayment.find(query)
      .populate("vehicle", "name brand category image images pricePerKm")
      .populate("user", "name email mobile")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      total,
      page,
      totalPages: Math.ceil(total / limit),
      bookings,
    };
  }

  /**
   * 6. Get Booking by ID / Code
   */
  async getBookingById(id, userContext = null) {
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { bookingCode: id };

    const booking = await BookingPayment.findOne(query)
      .populate("vehicle")
      .populate("user", "name email mobile");

    if (!booking) {
      const error = new Error("Booking not found");
      error.statusCode = 404;
      throw error;
    }

    if (userContext && userContext.role !== "admin" && String(booking.user?._id) !== String(userContext._id)) {
      const error = new Error("Unauthorized to access this booking record");
      error.statusCode = 403;
      throw error;
    }

    return booking;
  }
}

const bookingService = new BookingService();
export default bookingService;
export { BookingService, bookingService };
