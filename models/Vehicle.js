import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
  {
    // 🔹 Basic vehicle details
    name: { type: String, required: true },
    brand: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "sedan",
        "SUV",
        "Bike",
        "Convertible",
        "Truck",
        "Van",
        "Coupe",
        "Wagon",
        "Other",
      ],
      required: true,
    },
    seats: { type: Number, default: 4 },
   pricePerKM: {
  type: Number,
  required: false,   // <-- change from true → false
  default: null      // so it won’t throw error if missing
},

    pricePerHour: { type: Number },
     // ✅ added daily price

    // 🔹 Availability
    available: { type: Boolean, default: true },
    isBooked: { type: Boolean, default: false },

    // 🔹 Current booking details (if booked)
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    bookedByName: { type: String, default: null },

    // 🔹 Travel details
    origin: { type: String, default: null },
    destination: { type: String, default: null },
    isRoundTrip: { type: Boolean, default: false },
    baseLocation: { type: String },
    // 🔹 Location tracking
    baseLocation: { type: String },
    currentLocation: { type: String },

    // 🔹 Extra details
    images: [
    {
      fileId: { type: mongoose.Schema.Types.ObjectId },
      filename: String,
      originalName: String,
      contentType: String,
      size: Number,
      storageType: { type: String, default: "gridfs" },
      uploadedAt: Date,
    },
  ],
    features: { type: [String], default: [] },
    licensePlate: { type: String, unique: true },
    mileage: { type: Number },
    description: { type: String },
  },
  { timestamps: true }
);

// Indexes (for faster queries)
vehicleSchema.index({ available: 1 });
vehicleSchema.index({ type: 1 });
vehicleSchema.index({ currentLocation: 1 });

// ✅ Use existing model if compiled to prevent overwrite error
export default mongoose.models.Vehicle || mongoose.model("Vehicle", vehicleSchema);
