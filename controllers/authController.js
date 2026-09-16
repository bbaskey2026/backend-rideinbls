// controllers/authController.js
import mongoose from "mongoose";
import authService from "../services/authService.js";
import User from "../models/User.js";

const checkDB = (res) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      success: false,
      message:
        "Database is unreachable. Please add your current IP address (or 0.0.0.0/0) to MongoDB Atlas Network Access whitelist.",
    });
    return false;
  }
  return true;
};

// 1. Register
export const register = async (req, res, next) => {
  try {
    if (!checkDB(res)) return;
    const result = await authService.register(req.body);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Verify Registration OTP
export const verifyRegistrationOtp = async (req, res, next) => {
  try {
    const result = await authService.verifyRegistrationOtp(req.body);
    return res.status(201).json({
      success: true,
      message: "Account registered and verified successfully!",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Login
export const login = async (req, res, next) => {
  try {
    if (!checkDB(res)) return;
    const result = await authService.login(req.body);

    return res.status(200).json({
      success: true,
      message: `Verification OTP sent to ${result.userEmail}.`,
      otp: result.otp,
    });
  } catch (error) {
    next(error);
  }
};

// 4. Verify Login OTP
export const verifyLoginOtp = async (req, res, next) => {
  try {
    const result = await authService.verifyLoginOtp(req.body);

    return res.status(200).json({
      success: true,
      message: "Login successful!",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// 5. Resend OTP
export const resendOtp = async (req, res, next) => {
  try {
    const result = await authService.resendOtp(req.body);

    return res.status(200).json({
      success: true,
      message: "A new OTP code has been dispatched to your email.",
      otp: result.otp,
    });
  } catch (error) {
    next(error);
  }
};

// 6. Forgot Password
export const forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.forgotPassword(req.body);

    return res.status(200).json({
      success: true,
      message: "Password reset OTP sent to your email inbox.",
      otp: result.otp,
    });
  } catch (error) {
    next(error);
  }
};

// 7. Reset Password
export const resetPassword = async (req, res, next) => {
  try {
    await authService.resetPassword(req.body);

    return res.status(200).json({
      success: true,
      message: "Your password has been reset successfully. Please login with your new password.",
    });
  } catch (error) {
    next(error);
  }
};

// 8. Get Current Authenticated Profile
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 9. Update Profile
export const updateProfile = async (req, res, next) => {
  try {
    const { name, mobile, email } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (name) user.name = name;
    if (mobile) user.mobile = String(mobile).trim();
    if (email) user.email = email.toLowerCase().trim();

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// 10. Unified OTP Verification
export const verifyOtp = async (req, res, next) => {
  try {
    if (!checkDB(res)) return;
    const result = await authService.verifyOtp(req.body);

    return res.status(result.type === "register" ? 201 : 200).json({
      success: true,
      message: result.type === "register" ? "Account verified and registered successfully!" : "Login successful!",
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
};

// Aliases for route flexibility
export const registerUser = register;
export const loginUser = login;
export const getCurrentUser = getMe;
export const sendOtp = resendOtp;
