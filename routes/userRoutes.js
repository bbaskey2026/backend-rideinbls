import express from "express";
import authRoutes from "./authRoutes.js";

// Re-export or forward to authRoutes for backward compatibility
const router = express.Router();
router.use("/", authRoutes);

export default router;