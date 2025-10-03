import mongoose from "mongoose";

// Image schema for Cloudinary
const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },            // secure_url from Cloudinary
    public_id: { type: String, required: true },      // public_id (for deletion/replacement)
    format: { type: String },                         // jpg, png, webp, etc.
    bytes: { type: Number },                          // file size in bytes
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const vehicleSchema = new mongoose.Schema(
  {
    // Basic vehicle details
    name: { type: String, required: true },
    brand: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "sedan", "SUV", "suv", "Bike", "bike", "Convertible", "convertible",
        "Truck", "truck", "Van", "van", "Coupe", "coupe", "Wagon", "wagon",
        "hatchback", "motorcycle", "Other",
      ],
      required: true,
    },
    seats: { type: Number, default: 4 },
    capacity: { type: Number, default: 4 },
    pricePerKM: { type: Number, default: null },
    pricePerHour: { type: Number },

    // Availability
    isAvailable: { type: Boolean, default: true },
    isBooked: { type: Boolean, default: false },

    // Booking details
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    bookedByName: { type: String, default: null },

    // Travel details
    origin: { type: String, default: null },
    destination: { type: String, default: null },
    isRoundTrip: { type: Boolean, default: false },
    baseLocation: { type: String },
    currentLocation: { type: String },
    location: { type: String },

    // ✅ Cloudinary images
    images: { type: [imageSchema], default: [] },

    // Extra details
    features: { type: [String], default: [] },
    licensePlate: { type: String, unique: true },
    mileage: { type: Number },
    description: { type: String },

    // Additional fields
    fuelType: { type: String },
    transmission: { type: String },
    year: { type: Number },
    color: { type: String },
  },
  { timestamps: true }
);

// Indexes
vehicleSchema.index({ isAvailable: 1 });
vehicleSchema.index({ type: 1 });
vehicleSchema.index({ currentLocation: 1 });

export default mongoose.models.Vehicle || mongoose.model("Vehicle", vehicleSchema);
