import mongoose from "mongoose";

const bookingPaymentSchema = new mongoose.Schema(
  {
    // References
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Trip details
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    isRoundTrip: { type: Boolean, default: false },

    // Schedule
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },

    // Unique booking code
    bookingCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // Pricing
    totalPrice: { type: Number, required: true },

    // Payment details
    payment: {
      provider: {
        type: String,
        default: "razorpay",
        trim: true,
        lowercase: true,
      },
      providerPaymentId: { type: String, trim: true },
      orderId: { type: String, trim: true, index: true },
      signature: { type: String },
      amount: { type: Number, required: true },
      currency: { type: String, default: "INR" },
      status: {
        type: String,
        enum: ["pending", "paid", "cancelled", "failed", "refunded"],
        default: "pending",
      },
      paymentMethod: { type: String, default: "upi" },
      failureReason: { type: String },
    },

    // Detailed Refund Tracking
    refund: {
      isRefunded: { type: Boolean, default: false },
      refundId: { type: String, trim: true },
      refundAmount: { type: Number, default: 0 },
      refundStatus: {
        type: String,
        enum: ["none", "pending", "processed", "failed"],
        default: "none",
      },
      refundedAt: { type: Date },
      refundReason: { type: String },
      deductionAmount: { type: Number, default: 0 },
    },

    // Payment status summary
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded", "Partially Refunded"],
      default: "Pending",
      index: true,
    },

    // Booking workflow status
    bookingStatus: {
      type: String,
      enum: ["Pending", "Confirmed", "Cancelled", "Completed"],
      default: "Pending",
      index: true,
    },

    // Assigned driver info
    assignedDriver: {
      name: { type: String },
      mobile: { type: String },
      licenseNumber: { type: String },
    },

    notes: { type: String },
  },
  { timestamps: true, versionKey: false }
);

bookingPaymentSchema.index({ user: 1, createdAt: -1 });
bookingPaymentSchema.index({ vehicle: 1, startDate: 1 });

const BookingPayment =
  mongoose.models.BookingPayment ||
  mongoose.model("BookingPayment", bookingPaymentSchema);

export default BookingPayment;

