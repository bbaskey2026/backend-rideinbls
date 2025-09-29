import mongoose from "mongoose";

/**
 * Connect to MongoDB
 */
export const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined in environment variables");
  }

  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1); // Exit process with failure
  }

  // Optional: Event listeners
  mongoose.connection.on("disconnected", () => {
    console.warn(" MongoDB disconnected! Attempting reconnect...");
  });

  mongoose.connection.on("error", (err) => {
    console.error(" MongoDB error:", err);
  });
};
