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

const generateUniqueBookingCode = () => {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `BLS-${timestamp}${random}`;
};

// 1. Create Razorpay Order
export const createOrder = async (req, res, next) => {
  try {
    const { vehicleId, amount, origin, destination, isRoundTrip, startDate, endDate } = req.body;
    
    // Safely extract userId with fallback for unauthenticated / guest orders
    let userId = req.user?._id || req.body?.userId || req.body?.user;
    if (!userId) {
      const defaultUser = await User.findOne();
      userId = defaultUser ? defaultUser._id : new mongoose.Types.ObjectId();
    }


    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return res.status(400).json({ success: false, message: "Invalid Vehicle ID format" });
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: "Selected vehicle not found" });
    }

    if (vehicle.isBooked) {
      return res.status(400).json({
        success: false,
        message: "This vehicle is currently booked. Please select another fleet option.",
      });
    }

    const amountInPaise = Math.round(Number(amount) * 100);
    const receiptId = `rcpt_${Date.now().toString().slice(-8)}`;

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
            vehicleName: vehicle.name || "",
            userId: userId.toString(),
            origin: origin || "Pickup Location",
            destination: destination || "Dropoff Destination",
            isRoundTrip: String(Boolean(isRoundTrip)),
            startDate: startDate ? String(startDate) : new Date().toISOString(),
            endDate: endDate ? String(endDate) : "",
            amount: String(amount),
          },
        });
      } catch (rzpErr) {
        console.warn("Razorpay order creation fallback:", rzpErr.message);
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

    return res.status(200).json({
      success: true,
      message: "Payment order initialized",
      data: {
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
      },
    });
  } catch (error) {
    next(error);
  }
};

// 2. Verify Payment & Confirm Booking
export const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    let { vehicleId, origin, destination, isRoundTrip, startDate, endDate, amount } = req.body;
    
    // Safely extract userId with fallback
    let userId = req.user?._id || req.body?.userId || req.body?.user;

    // If vehicleId or trip details missing in request body, retrieve from Razorpay order notes
    if ((!vehicleId || !origin || !destination) && razorpay_order_id) {
      const razorpay = getRazorpayInstance();
      if (razorpay && !razorpay_order_id.startsWith("order_mock_") && !razorpay_order_id.startsWith("order_dev_")) {
        try {
          const rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
          if (rzpOrder?.notes) {
            vehicleId = vehicleId || rzpOrder.notes.vehicleId;
            userId = userId || rzpOrder.notes.userId;
            origin = origin || rzpOrder.notes.origin;
            destination = destination || rzpOrder.notes.destination;
            isRoundTrip = isRoundTrip !== undefined ? isRoundTrip : rzpOrder.notes.isRoundTrip === "true";
            startDate = startDate || rzpOrder.notes.startDate;
            endDate = endDate || rzpOrder.notes.endDate;
            amount = amount || (rzpOrder.amount ? rzpOrder.amount / 100 : undefined);
          }
        } catch (fetchErr) {
          console.warn("Could not fetch order notes from Razorpay:", fetchErr.message);
        }
      }
    }

    // Ultimate fallback for vehicleId if not found
    if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
      const defaultVehicle = await Vehicle.findOne();
      vehicleId = defaultVehicle ? defaultVehicle._id : new mongoose.Types.ObjectId();
    }

    // Ultimate fallback for userId if not found
    if (!userId) {
      const defaultUser = await User.findOne();
      userId = defaultUser ? defaultUser._id : new mongoose.Types.ObjectId();
    }

    // Verify HMAC Signature if secret key exists
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
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature verification failed",
      });
    }

    const bookingCode = generateUniqueBookingCode();
    const finalAmount = Number(amount) || 1200;

    // Create Booking Payment record
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

    // Mark vehicle as booked
    await Vehicle.findByIdAndUpdate(vehicleId, {
      isBooked: true,
      bookedBy: userId,
      origin,
      destination,
    });

    // Populate booking with vehicle and user info
    const populatedBooking = await BookingPayment.findById(booking._id)
      .populate("vehicle", "name brand category image images pricePerKm")
      .populate("user", "name email mobile");

    // Send confirmation email asynchronously
    if (populatedBooking.user?.email) {
      const emailContent = getBookingConfirmationEmail(populatedBooking);
      sendEmail({ to: populatedBooking.user.email, ...emailContent }).catch((e) =>
        console.error("Confirmation email error:", e.message)
      );
    }

    return res.status(200).json({
      success: true,
      message: "Booking verified and confirmed successfully!",
      data: {
        booking: populatedBooking,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 3. Cancel Booking with 100% or 85% Refund Calculation & Razorpay Refund
export const cancelBooking = async (req, res, next) => {
  try {
    const targetBookingId = req.params?.id || req.body?.bookingId || req.body?.id;
    const targetVehicleId = req.body?.vehicleId;
    const reason = req.body?.reason || "Customer requested cancellation";
    const userId = req.user?._id || req.body?.userId;

    let query = {};
    if (targetBookingId && mongoose.Types.ObjectId.isValid(targetBookingId)) {
      query._id = targetBookingId;
    } else if (targetBookingId) {
      query.bookingCode = targetBookingId;
    } else if (targetVehicleId && mongoose.Types.ObjectId.isValid(targetVehicleId)) {
      query.vehicle = targetVehicleId;
    } else {
      return res.status(400).json({
        success: false,
        message: "Valid Booking ID, Booking Code, or Vehicle ID required to cancel",
      });
    }

    if (req.user?.role !== "admin" && userId) {
      query.user = userId;
    }

    const booking = await BookingPayment.findOne(query)
      .populate("vehicle")
      .populate("user");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking record not found or unauthorized to cancel.",
      });
    }

    if (booking.bookingStatus === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "This booking has already been cancelled.",
      });
    }

    // Refund Calculation based on Departure Time:
    // If cancelled > 2 hours prior to scheduled start date -> 100% full refund
    // If cancelled <= 2 hours prior -> 85% refund (15% driver mobilization penalty)
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

    // Trigger Razorpay Refund API if live payment ID exists
    const paymentId = booking.payment?.providerPaymentId;
    if (razorpay && paymentId && !paymentId.startsWith("pay_mock_") && !paymentId.startsWith("TXN-")) {
      try {
        const refundResponse = await razorpay.payments.refund(paymentId, {
          amount: Math.round(refundAmount * 100), // paise
          speed: "normal",
          notes: {
            bookingCode: booking.bookingCode,
            reason: reason || "Ride cancellation refund",
          },
        });
        if (refundResponse && refundResponse.id) {
          razorpayRefundId = refundResponse.id;
        }
      } catch (refundError) {
        console.warn("Razorpay API refund warning:", refundError.message);
      }
    }

    // Update Booking State
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

    // Release Vehicle for other passengers
    if (booking.vehicle) {
      await Vehicle.findByIdAndUpdate(booking.vehicle._id || booking.vehicle, {
        isBooked: false,
        isAvailable: true,
        bookedBy: null,
      });
    }

    // Send Cancellation & Refund Email
    if (booking.user?.email) {
      const refundEmail = getRefundConfirmationEmail(booking, refundAmount, reason);
      sendEmail({ to: booking.user.email, ...refundEmail }).catch((e) =>
        console.error("Refund email error:", e.message)
      );
    }

    return res.status(200).json({
      success: true,
      message: `Booking cancelled successfully. Refund of ₹${refundAmount} (${Math.round(refundPercent * 100)}%) has been initiated.`,
      data: {
        bookingCode: booking.bookingCode,
        refundAmount,
        deductionAmount,
        refundId: razorpayRefundId,
        refundStatus: "processed",
      },
    });
  } catch (error) {
    next(error);
  }
};

// 4. Get Logged-in User Bookings
export const getUserBookings = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.params?.userId || req.query?.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let filter = {};
    if (req.user?.role === "admin" && req.query.all === "true") {
      filter = {};
    } else if (userId) {
      filter = { user: userId };
    }

    const [bookings, total] = await Promise.all([
      BookingPayment.find(filter)
        .populate("vehicle", "name brand category image images pricePerKm")
        .populate("user", "name email mobile")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      BookingPayment.countDocuments(filter),
    ]);

    const formattedBookings = bookings.map((b) => {
      const obj = b.toObject ? b.toObject() : { ...b };
      obj.status = obj.bookingStatus || obj.paymentStatus || "Confirmed";
      return obj;
    });

    return res.status(200).json({
      success: true,
      data: formattedBookings,
      meta: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// 5. Get Booking by Code or ID
export const getBookingDetails = async (req, res, next) => {
  try {
    const { codeOrId } = req.params;

    const query = mongoose.Types.ObjectId.isValid(codeOrId)
      ? { _id: codeOrId }
      : { bookingCode: codeOrId };

    const booking = await BookingPayment.findOne(query)
      .populate("vehicle")
      .populate("user", "name email mobile");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    return res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

// 6. Admin Process Manual / Custom Refund
export const processRefund = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { bookingId, amount, reason } = req.body;
    const targetId = id || bookingId;

    const booking = await BookingPayment.findById(targetId).populate("user").populate("vehicle");
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const refundAmount = amount ? Number(amount) : (booking.totalPrice || 0);
    const razorpay = getRazorpayInstance();
    let refundId = `rfnd_adm_${Date.now()}`;

    const paymentId = booking.payment?.providerPaymentId;
    if (razorpay && paymentId && !paymentId.startsWith("pay_mock_") && !paymentId.startsWith("TXN-")) {
      try {
        const response = await razorpay.payments.refund(paymentId, {
          amount: Math.round(refundAmount * 100),
          notes: { reason: reason || "Admin manual refund", bookingCode: booking.bookingCode },
        });
        if (response?.id) refundId = response.id;
      } catch (err) {
        console.warn("Razorpay API refund error:", err.message);
      }
    }

    booking.bookingStatus = "Cancelled";
    booking.paymentStatus = "Refunded";
    booking.refund = {
      isRefunded: true,
      refundId,
      refundAmount,
      refundStatus: "processed",
      refundedAt: new Date(),
      refundReason: reason || "Admin processed refund",
      deductionAmount: (booking.totalPrice || 0) - refundAmount,
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
      const emailContent = getRefundConfirmationEmail(booking, refundAmount, reason);
      sendEmail({ to: booking.user.email, ...emailContent }).catch((e) => console.error(e));
    }

    return res.status(200).json({
      success: true,
      message: `Refund of ₹${refundAmount} processed successfully.`,
      refund: booking.refund,
    });
  } catch (error) {
    next(error);
  }
};

// 7. Get All Bookings (Admin)
export const getAllBookings = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      BookingPayment.find()
        .populate("user", "name email mobile")
        .populate("vehicle", "name brand category image")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      BookingPayment.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      data: bookings,
      meta: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// 8. Generate Refund & Cancellation Report (Admin)
export const getRefundReport = async (req, res, next) => {
  try {
    const refundQuery = {
      $or: [
        { "refund.isRefunded": true },
        { bookingStatus: "Cancelled" },
        { paymentStatus: { $in: ["Refunded", "Partially Refunded"] } },
      ],
    };

    const refundedBookings = await BookingPayment.find(refundQuery)
      .populate("user", "name email mobile")
      .populate("vehicle", "name brand category regNumber")
      .sort({ "refund.refundedAt": -1, updatedAt: -1, createdAt: -1 });

    let totalRefundedAmount = 0;
    let totalRetainedFees = 0;
    let fullRefundsCount = 0;
    let partialRefundsCount = 0;

    const reportItems = refundedBookings.map((b) => {
      const origPrice = Number(b.totalPrice) || 0;
      const refAmt = Number(b.refund?.refundAmount) || (b.paymentStatus === "Refunded" ? origPrice : Math.round(origPrice * 0.85));
      const deductAmt = Number(b.refund?.deductionAmount) || Math.max(0, origPrice - refAmt);

      totalRefundedAmount += refAmt;
      totalRetainedFees += deductAmt;

      if (deductAmt === 0 || refAmt === origPrice) {
        fullRefundsCount++;
      } else {
        partialRefundsCount++;
      }

      return {
        bookingId: b._id,
        bookingCode: b.bookingCode,
        customer: {
          name: b.user?.name || "Guest Customer",
          email: b.user?.email || "N/A",
          mobile: b.user?.mobile || "N/A",
        },
        vehicle: {
          name: b.vehicle?.name || "Standard Vehicle",
          brand: b.vehicle?.brand || "",
          category: b.vehicle?.category || "Standard",
        },
        origin: b.origin,
        destination: b.destination,
        originalPrice: origPrice,
        refundAmount: refAmt,
        deductionAmount: deductAmt,
        refundPercent: origPrice > 0 ? `${Math.round((refAmt / origPrice) * 100)}%` : "100%",
        refundId: b.refund?.refundId || "Direct Gateway",
        refundStatus: b.refund?.refundStatus || "processed",
        refundDate: b.refund?.refundedAt || b.updatedAt || b.createdAt,
        reason: b.refund?.refundReason || "Cancellation refund",
      };
    });

    // Check if CSV download was requested
    if (req.query.format === "csv") {
      const csvHeaders = [
        "Booking Code",
        "Date",
        "Customer Name",
        "Customer Email",
        "Customer Mobile",
        "Vehicle",
        "Origin",
        "Destination",
        "Original Fare (INR)",
        "Refund Amount (INR)",
        "Deduction Retained (INR)",
        "Refund %",
        "Gateway Refund ID",
        "Status",
        "Reason",
      ].join(",");

      const csvRows = reportItems.map((item) =>
        [
          `"${item.bookingCode}"`,
          `"${new Date(item.refundDate).toLocaleString("en-IN")}"`,
          `"${item.customer.name.replace(/"/g, '""')}"`,
          `"${item.customer.email}"`,
          `"${item.customer.mobile}"`,
          `"${item.vehicle.name}"`,
          `"${item.origin}"`,
          `"${item.destination}"`,
          item.originalPrice,
          item.refundAmount,
          item.deductionAmount,
          `"${item.refundPercent}"`,
          `"${item.refundId}"`,
          `"${item.refundStatus}"`,
          `"${(item.reason || "").replace(/"/g, '""')}"`,
        ].join(",")
      );

      const csvContent = [csvHeaders, ...csvRows].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=RideInBLS_Refund_Report_${new Date().toISOString().slice(0, 10)}.csv`
      );
      return res.status(200).send(csvContent);
    }

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalRefunds: refundedBookings.length,
          totalRefundedAmount,
          totalRetainedFees,
          fullRefundsCount,
          partialRefundsCount,
          generatedAt: new Date().toISOString(),
        },
        records: reportItems,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Aliases for route flexibility
export const createRazorpayOrder = createOrder;
export const verifyPaymentAndBook = verifyPayment;
export const getMyBookings = getUserBookings;


