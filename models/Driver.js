import mongoose from "mongoose";

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    mobile: { type: String, required: true },
    licenseNumber: { type: String, required: true },
    experienceYears: { type: Number, default: 1 },
    vehicleModel: { type: String, required: true },
    vehicleNumber: { type: String, required: true },
    city: { type: String, default: "Balasore" },
    status: {
      type: String,
      enum: ["pending", "verified", "rejected", "active", "suspended"],
      default: "pending",
    },
    rating: { type: Number, default: 5.0 },
    totalTrips: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Driver = mongoose.models.Driver || mongoose.model("Driver", driverSchema);

export default Driver;
