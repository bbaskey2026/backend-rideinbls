import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import imageRoutes from "./routes/imageRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import vehicleRoutes from "./routes/vehicleRoutes.js";
import googleRoutes from "./routes/googleRoutes.js";
import protectedRoute from "./routes/vehicleRoutes.js";
import adminRoutes from "./routes/admin.js";
import paymentRoutes from "./routes/paymentRoutes.js";

dotenv.config();

const app = express();

// ----------------------
// Middleware
// ----------------------

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://maps.googleapis.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  })
);

// CORS - restrict to frontend only
app.use(
  cors({
    origin: "https://frontend-rideinbls.onrender.com", 
  
  })
);


// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max requests per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, try again later." },
});
app.use("/api/", apiLimiter);

// Logger
morgan.token("date", () => new Date().toLocaleString());
app.use(
  morgan(":method :url :status :res[content-length] - :response-time ms :date")
);

// ----------------------
// MongoDB Connection
// ----------------------
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// ----------------------
// HTTPS redirect for production
// ----------------------
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect("https://" + req.headers.host + req.url);
    }
    next();
  });
}

// ----------------------
// Routes
// ----------------------
app.use("/api/auth", userRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api", protectedRoute);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/images", imageRoutes);
// Root API check
app.get("/", (req, res) => {
  res.send("🚀 API is running...");
});

// ----------------------
// Global Error Handler
// ----------------------
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    console.error(err.message);
    res.status(500).json({ error: "Internal Server Error" });
  } else {
    console.error(err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ----------------------
// Start Server
// ----------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
);
