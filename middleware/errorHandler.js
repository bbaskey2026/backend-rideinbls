import { logger } from "./logger.js";
import { ZodError } from "zod";

export const errorHandler = (err, req, res, next) => {
  // Mongoose Cast Error (ObjectId / Type casting)
  if (err.name === "CastError") {
    if (err.kind === "ObjectId" || err.path === "_id") {
      return res.status(400).json({
        success: false,
        message: `Resource not found with invalid ID format: ${err.value}`,
      });
    }
    return res.status(400).json({
      success: false,
      message: `Invalid format for field '${err.path}': ${err.value}`,
    });
  }

  // Mongoose Duplicate Key (Code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(400).json({
      success: false,
      message: `A record with this ${field} already exists.`,
    });
  }

  // Mongoose Validation Error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((val) => val.message);
    return res.status(400).json({
      success: false,
      message: messages[0] || "Validation Error",
      errors: messages,
    });
  }

  // Zod Validation Error
  if (err instanceof ZodError || err.name === "ZodError" || err.issues) {
    const issues = err.issues || err.errors || [];
    const formatted = issues.map((i) => ({
      field: (i.path || []).filter((p) => p !== "body" && p !== "query").join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      message: formatted[0]?.message || "Validation Error",
      errors: formatted,
    });
  }

  // Razorpay error
  if (err.statusCode && err.error?.description) {
    logger.warn(`Razorpay API Error: ${err.error.description}`);
    return res.status(err.statusCode).json({
      success: false,
      message: err.error.description,
      error: err.error,
    });
  }

  logger.error(`Application Error on ${req.method} ${req.originalUrl}: ${err.message}`, err);

  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

export default errorHandler;
