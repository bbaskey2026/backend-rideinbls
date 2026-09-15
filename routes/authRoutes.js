import express from "express";
import {
  registerUser,
  loginUser,
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  updateProfile,
} from "../controllers/authController.js";
import { validate } from "../middleware/validate.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from "../validators/authValidators.js";

const router = express.Router();

// Registration & Login
router.post("/register", validate(registerSchema), registerUser);
router.post("/login", validate(loginSchema), loginUser);

// Unified & Specialized OTP Verification Endpoints
router.post("/verify-otp", validate(verifyOtpSchema), verifyOtp);
router.post("/register/verify", validate(verifyOtpSchema), verifyOtp);
router.post("/login/verify", validate(verifyOtpSchema), verifyOtp);

// OTP Sending / Resending
router.post("/send-otp", validate(sendOtpSchema), sendOtp);
router.post("/resend-otp", validate(sendOtpSchema), sendOtp);

// Password Recovery
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

// Profile
router.get("/me", authMiddleware, getCurrentUser);
router.put("/profile", authMiddleware, validate(updateProfileSchema), updateProfile);

export default router;
