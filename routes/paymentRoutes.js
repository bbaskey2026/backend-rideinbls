import express from "express";
import bookingRoutes from "./bookingRoutes.js";

// Export the modular booking router to maintain complete backwards compatibility with /api/payments/*
const router = express.Router();
router.use("/", bookingRoutes);

export default router;