import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "rideinbls_jwt_fallback_secret_key";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Access token required. Please login.",
      });
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format. Use Bearer <token>",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id || decoded.id || decoded.userId;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User session expired or account not found",
      });
    }

    if (user.isActive === false || user.isBlocked === true) {
      return res.status(403).json({
        success: false,
        message: "Account suspended or deactivated. Please contact support.",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please sign in again.",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid or malformed authorization token.",
    });
  }
};

export const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Forbidden. Administrator privileges required.",
    });
  }
  next();
};

export const adminMiddleware = adminOnly;

export default { authMiddleware, adminOnly, adminMiddleware };

