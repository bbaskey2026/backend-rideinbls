import mongoose from "mongoose";
import BookingPayment from "../models/BookingPayment.js";
import Vehicle from "../models/Vehicle.js";
import { getRazorpayInstance } from "../config/razorpay.js";
import { sendEmail, getRefundConfirmationEmail } from "../config/mailer.js";
import * as bookingService from "../services/bookingService.js";
import pricingService from "../services/pricingService.js";

// 0. Calculate Estimated Fare Breakdown (Distance, Hours, GST)
export const calculateFare = async (req, res, next) => {
  try {
    const { vehicleId, distanceKm, distance, durationHours, hours, isRoundTrip, startDate, endDate, gstPercent } = {
      ...req.query,
      ...req.body,
    };

    let calculatedHours = Number(durationHours || hours || 0);
    if (!calculatedHours && startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      if (end > start) {
        calculatedHours = Math.round((end - start) / (1000 * 60 * 60));
      }
    }

    let result;
    if (vehicleId) {
      result = await pricingService.calculateVehicleFare(vehicleId, {
        distanceKm: distanceKm || distance,
        durationHours: calculatedHours,
        isRoundTrip: isRoundTrip === true || isRoundTrip === "true",
        gstPercent,
      });
    } else {
      result = pricingService.calculateFare({
        distanceKm: distanceKm || distance,
        durationHours: calculatedHours,
        isRoundTrip: isRoundTrip === true || isRoundTrip === "true",
        gstPercent,
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 1. Create Razorpay Order
export const createOrder = async (req, res, next) => {
  try {
    const result = await bookingService.createOrder(req.body, req.user);
    return res.status(200).json({
      success: true,
      message: "Payment order initialized",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Verify Payment & Confirm Booking
export const verifyPayment = async (req, res, next) => {
  try {
    const populatedBooking = await bookingService.verifyPayment(req.body, req.user);
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

// 3. Cancel Booking
export const cancelBooking = async (req, res, next) => {
  try {
    const targetBookingId = req.params?.id || req.body?.bookingId || req.body?.id || req.body?.vehicleId;
    const reason = req.body?.reason || "Customer requested cancellation";

    const result = await bookingService.cancelBooking(targetBookingId, req.user, reason);

    return res.status(200).json({
      success: true,
      message: `Booking cancelled successfully. Refund of ₹${result.refundAmount} (${result.refundPercent}%) has been initiated.`,
      data: {
        bookingCode: result.booking.bookingCode,
        refundAmount: result.refundAmount,
        deductionAmount: result.booking.refund?.deductionAmount,
        refundId: result.booking.refund?.refundId,
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
    const targetId = req.params?.id || req.params?.codeOrId;
    const booking = await bookingService.getBookingById(targetId, req.user);

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
    const result = await bookingService.getAllBookings({
      status: req.query.status,
      paymentStatus: req.query.paymentStatus,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      data: result.bookings,
      meta: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
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
