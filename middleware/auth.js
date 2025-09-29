import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Invalid token format. Use: Bearer <token>",
      });
    }

    // ✅ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Find user using decoded._id
    const user = await User.findById(decoded._id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User not found or account has been deleted",
      });
    }

    // ✅ Attach user to req
    req.user = user;

    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);

    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Token has expired. Please login again.",
      });
    }

    return res.status(500).json({ success: false, error: "Authentication failed" });
  }
};
