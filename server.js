import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Production Logger
import { logger, requestLogger } from "./middleware/logger.js";

// Modular Route Imports
import authRoutes from "./routes/authRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import vehicleRoutes from "./routes/vehicleRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import driverRoutes from "./routes/driverRoutes.js";
import googleRoutes from "./routes/googleRoutes.js";
import imageRoutes from "./routes/imageRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import dns from "dns";

dotenv.config();

// Ensure reliable SRV DNS lookup for MongoDB Atlas on Windows
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore if already set
}

const app = express();



// ----------------------
// Security & Utility Middleware
// ----------------------
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false, // Permissive for API servers with cross-origin assets
  })
);

// Flexible CORS for Local Dev & Production
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://frontend-rideinbls.onrender.com",
  "https://rideinbls.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      return callback(null, true); // Permissive to prevent CORS lockouts
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Production-grade Request Logger (logs every incoming hit and response timing)
app.use(requestLogger);

// Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again in a few minutes.",
  },
});
app.use("/api/", apiLimiter);

// ----------------------
// Modular API Route Mounting
// ----------------------
app.use("/api/auth", authRoutes);
app.use("/api/users", authRoutes); // Backwards compatibility
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", bookingRoutes); // Backwards compatibility
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/images", imageRoutes);

// Health check / Root
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🚀 RideInBLS API is online and operational",
    version: "2.0.0",
    docs: "/api/health",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    dbConnected: mongoose.connection.readyState === 1,
    timestamp: new Date().toISOString(),
  });
});

// 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
  });
});

// Global Centralized Error Handler (Zod errors, MongoDB errors, generic exceptions)
app.use(errorHandler);

// ----------------------
// MongoDB Connection & Server Startup
// ----------------------
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    if (process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
      });
      logger.info("MongoDB connected successfully");
    } else {
      logger.warn("MONGO_URI not defined in environment. Running in disconnected mode for local testing.");
    }

    app.listen(PORT, () => {
      logger.info(`RideInBLS API listening on port ${PORT} [Mode: ${process.env.NODE_ENV || "development"}]`);
    });
  } catch (err) {
    logger.error("Database connection error:", err);
    app.listen(PORT, () => {
      logger.warn(`RideInBLS API running with DB connection issues on port ${PORT}`);
    });
  }
};

startServer();

export default app;
