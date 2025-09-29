import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
      index: true 
    },
    vehicleId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Vehicle", 
      required: true, 
      index: true 
    },

    provider: { 
      type: String, 
      required: true, 
      trim: true, 
      lowercase: true, 
      enum: ["razorpay", "stripe", "paypal", "other"], 
      index: true 
    },

    providerPaymentId: { 
      type: String, 
      required: true, 
      trim: true 
    },

    orderId: { 
      type: String, 
      unique: true, 
      required: true, 
      trim: true, 
      index: true 
    }, // Razorpay/Stripe/PayPal order ID

    amount: { 
      type: Number, 
      required: true, 
      min: [1, "Amount must be greater than 0"] 
    },

    currency: { 
      type: String, 
      required: true, 
      uppercase: true, 
      default: "INR", 
      match: /^[A-Z]{3}$/ // ISO 4217 format (e.g., INR, USD, EUR)
    },

    status: { 
      type: String, 
      enum: ["pending", "paid", "cancelled", "failed"], 
      default: "pending", 
      index: true 
    },

    bookingStatus: { 
      type: String, 
      enum: ["Pending", "Confirmed", "Cancelled"], 
      default: "Pending" 
    },

    bookedByName: { 
      type: String, 
      trim: true, 
      maxlength: 100 
    },

    // ✅ Additional production-level fields
    failureReason: { type: String, trim: true }, // e.g., insufficient funds
    refundId: { type: String, trim: true },      // for tracking refunds
    paymentMethod: { 
      type: String, 
      enum: ["card", "upi", "netbanking", "wallet", "cash"], 
      default: "upi" 
    },
    isRefunded: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed } // flexible field for extra info
  },
  { 
    timestamps: true,
    versionKey: false // remove "__v"
  }
);

// ✅ Compound Index for faster search on user + order
paymentSchema.index({ userId: 1, orderId: 1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
