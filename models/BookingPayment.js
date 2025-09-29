import mongoose from "mongoose";

// Booking + Payment Schema
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
    origin: { type: String },
    destination: { type: String },
    isRoundTrip: { type: Boolean, default: false },

    // Time details
    startDate: { type: Date },
    endDate: { type: Date },

    // Unique booking code
    bookingCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // Pricing & Payment
    totalPrice: { type: Number, required: true },

    payment: {
      provider: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        enum: ["razorpay", "stripe", "paypal", "other"],
        index: true
      },
      providerPaymentId: { type: String, required: true, trim: true },
      orderId: { type: String, unique: true, required: true, trim: true, index: true },
      amount: { type: Number, required: true, min: [1, "Amount must be greater than 0"] },
      currency: { type: String, required: true, uppercase: true, default: "INR", match: /^[A-Z]{3}$/ },
      status: { type: String, enum: ["pending", "paid", "cancelled", "failed"], default: "pending", index: true },
      paymentMethod: { type: String, enum: ["card", "upi", "netbanking", "wallet", "cash"], default: "upi" },
      failureReason: { type: String, trim: true },
      refundId: { type: String, trim: true },
      isRefunded: { type: Boolean, default: false },
      metadata: { type: mongoose.Schema.Types.Mixed },
      bookedByName: { type: String, trim: true, maxlength: 100 },
    },

    // Payment status (for quick reference)
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded", "No Refund"],
      default: "Pending",
      index: true,
    },

    // Booking status
    bookingStatus: {
      type: String,
      enum: ["Pending", "Confirmed", "Cancelled", "Completed"],
      default: "Pending",
      index: true,
    },

    // Admin tracking
    createdByAdmin: { type: Boolean, default: false },
    notes: { type: String },
  },
  { timestamps: true, versionKey: false }
);

// Indexes for performance
bookingPaymentSchema.index({ user: 1, vehicle: 1, "payment.orderId": 1 });
bookingPaymentSchema.index({ vehicle: 1, startDate: 1 });
bookingPaymentSchema.index({ bookingCode: 1 });

const BookingPayment = mongoose.model("BookingPayment", bookingPaymentSchema);

export default BookingPayment;
