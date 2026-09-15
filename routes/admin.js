import express from "express";
import adminRoutes from "./adminRoutes.js";

const router = express.Router();
router.use("/", adminRoutes);

export default router;