import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import { sendEmail, getOTPEmailTemplate } from "../config/mailer.js";
import mongoose from "mongoose";
import dotenv from "dotenv";


dotenv.config();


const JWT_SECRET = process.env.JWT_SECRET || "rideinbls_jwt_fallback_secret_key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const checkDB = (res) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      success: false,
      message: "Database is unreachable. Please add your current IP address (or 0.0.0.0/0) to MongoDB Atlas Network Access whitelist.",
    });
    return false;
  }
  return true;
};

// In-memory OTP Cache with TTL
const otpCache = new Map();
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const generateNumericOTP = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

const signToken = (user) => {
  return jwt.sign(
    { _id: user._id, id: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// 1. Register: Create unverified state & send OTP
export const register = async (req, res, next) => {
  try {
    if (!checkDB(res)) return;
    const { name, email, mobile, password } = req.body;


    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { mobile: String(mobile) }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email or mobile number already exists.",
      });
    }

    const otp = generateNumericOTP();
    const normalizedEmail = email.toLowerCase().trim();

    // Store pending registration data
    otpCache.set(`reg:${normalizedEmail}`, {
      name,
      email: normalizedEmail,
      mobile: String(mobile),
      password,
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    // Send OTP via Email
    const emailData = getOTPEmailTemplate(otp, "register", name);
    await sendEmail({ to: normalizedEmail, ...emailData });

    console.log(`[AUTH] Registration OTP generated for ${normalizedEmail}: ${otp}`);

    return res.status(200).json({
      success: true,
      message: "Verification OTP sent to your registered email address.",
      otp: process.env.NODE_ENV !== "production" ? otp : undefined,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Verify Registration OTP & create user
export const verifyRegistrationOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const cached = otpCache.get(`reg:${normalizedEmail}`);

    if (!cached) {
      return res.status(400).json({
        success: false,
        message: "Registration session expired. Please register again.",
      });
    }

    if (cached.expiresAt < Date.now()) {
      otpCache.delete(`reg:${normalizedEmail}`);
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (cached.otp !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP code. Please check your email and try again.",
      });
    }

    // Create user in database
    const newUser = await User.create({
      name: cached.name,
      email: cached.email,
      mobile: cached.mobile,
      password: cached.password,
      role: "user",
      isActive: true,
    });

    otpCache.delete(`reg:${normalizedEmail}`);
    const token = signToken(newUser);

    return res.status(201).json({
      success: true,
      message: "Account registered and verified successfully!",
      token,
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        mobile: newUser.mobile,
        role: newUser.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 3. Login: Send OTP to email or mobile
export const login = async (req, res, next) => {
  try {
    if (!checkDB(res)) return;
    const { email, mobile, password } = req.body;

    const identifier = (email || mobile || "").toString().toLowerCase().trim();

    const query = identifier.includes("@")
      ? { email: identifier }
      : { $or: [{ email: identifier }, { mobile: identifier }] };

    const user = await User.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No registered account found with these credentials.",
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password. Please try again.",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "Account is suspended. Please contact customer support.",
      });
    }

    const otp = generateNumericOTP();
    otpCache.set(`login:${user._id.toString()}`, {
      userId: user._id,
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    // Send OTP email
    const emailData = getOTPEmailTemplate(otp, "login", user.name);
    await sendEmail({ to: user.email, ...emailData });

    console.log(`[AUTH] Login OTP for ${user.email}: ${otp}`);

    return res.status(200).json({
      success: true,
      message: `Verification OTP sent to ${user.email}.`,
      otp: process.env.NODE_ENV !== "production" ? otp : undefined,
    });
  } catch (error) {
    next(error);
  }
};

// 4. Verify Login OTP
export const verifyLoginOtp = async (req, res, next) => {
  try {
    const { email, mobile, otp } = req.body;
    const identifier = (email || mobile || "").toString().toLowerCase().trim();

    const query = identifier.includes("@")
      ? { email: identifier }
      : { $or: [{ email: identifier }, { mobile: identifier }] };

    const user = await User.findOne(query);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const cached = otpCache.get(`login:${user._id.toString()}`);
    if (!cached) {
      return res.status(400).json({
        success: false,
        message: "Login session expired. Please sign in again.",
      });
    }

    if (cached.expiresAt < Date.now()) {
      otpCache.delete(`login:${user._id.toString()}`);
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    if (cached.otp !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP code. Please check and try again.",
      });
    }

    otpCache.delete(`login:${user._id.toString()}`);
    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 5. Resend OTP
export const resendOtp = async (req, res, next) => {
  try {
    const { email, mobile } = req.body;
    const identifier = (email || mobile || "").toString().toLowerCase().trim();

    const query = identifier.includes("@")
      ? { email: identifier }
      : { $or: [{ email: identifier }, { mobile: identifier }] };

    const user = await User.findOne(query);

    const targetEmail = user ? user.email : identifier;
    const otp = generateNumericOTP();

    if (user) {
      otpCache.set(`login:${user._id.toString()}`, {
        userId: user._id,
        otp,
        expiresAt: Date.now() + OTP_EXPIRY_MS,
      });
    } else {
      const reg = otpCache.get(`reg:${identifier}`);
      if (reg) {
        reg.otp = otp;
        reg.expiresAt = Date.now() + OTP_EXPIRY_MS;
        otpCache.set(`reg:${identifier}`, reg);
      }
    }

    const emailData = getOTPEmailTemplate(otp, "login", user?.name || "");
    await sendEmail({ to: targetEmail, ...emailData });

    return res.status(200).json({
      success: true,
      message: "A new OTP code has been dispatched to your email.",
      otp: process.env.NODE_ENV !== "production" ? otp : undefined,
    });
  } catch (error) {
    next(error);
  }
};

// 6. Forgot Password
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email address.",
      });
    }

    const otp = generateNumericOTP();
    otpCache.set(`reset:${normalizedEmail}`, {
      userId: user._id,
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    const emailData = getOTPEmailTemplate(otp, "forgot", user.name);
    await sendEmail({ to: normalizedEmail, ...emailData });

    return res.status(200).json({
      success: true,
      message: "Password reset OTP sent to your email inbox.",
      otp: process.env.NODE_ENV !== "production" ? otp : undefined,
    });
  } catch (error) {
    next(error);
  }
};

// 7. Reset Password
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const cached = otpCache.get(`reset:${normalizedEmail}`);
    if (!cached || cached.otp !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset OTP code.",
      });
    }

    const user = await User.findById(cached.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    user.password = newPassword;
    await user.save();

    otpCache.delete(`reset:${normalizedEmail}`);

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
    if (mobile) user.mobile = mobile;
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

// Unified OTP Verification (handles both Registration and Login OTPs)
export const verifyOtp = async (req, res, next) => {

  try {
    const { email, mobile, otp } = req.body;
    const identifier = (email || mobile || "").toString().toLowerCase().trim();

    if (!identifier || !otp) {
      return res.status(400).json({ success: false, message: "Email/mobile and OTP are required." });
    }

    const cleanOtp = String(otp).trim();

    // 1. Check if it's a Registration OTP
    const regCached = otpCache.get(`reg:${identifier}`);
    if (regCached) {
      if (regCached.expiresAt < Date.now()) {
        otpCache.delete(`reg:${identifier}`);
        return res.status(400).json({ success: false, message: "OTP has expired. Please register again." });
      }

      if (regCached.otp !== cleanOtp) {
        return res.status(400).json({ success: false, message: "Invalid OTP code. Please check and try again." });
      }

      if (!checkDB(res)) return;

      const newUser = await User.create({
        name: regCached.name,
        email: regCached.email,
        mobile: regCached.mobile,
        password: regCached.password,
        role: "user",
        isActive: true,
      });

      otpCache.delete(`reg:${identifier}`);
      const token = signToken(newUser);

      return res.status(201).json({
        success: true,
        message: "Account verified and registered successfully!",
        token,
        user: {
          _id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          mobile: newUser.mobile,
          role: newUser.role,
        },
      });
    }

    // 2. Check if it's a Login OTP
    if (!checkDB(res)) return;
    const query = identifier.includes("@")
      ? { email: identifier }
      : { $or: [{ email: identifier }, { mobile: identifier }] };

    const user = await User.findOne(query);

    if (user) {
      const loginCached = otpCache.get(`login:${user._id.toString()}`);
      if (loginCached) {
        if (loginCached.expiresAt < Date.now()) {
          otpCache.delete(`login:${user._id.toString()}`);
          return res.status(400).json({ success: false, message: "Login OTP expired. Please request a new code." });
        }

        if (loginCached.otp !== cleanOtp) {
          return res.status(400).json({ success: false, message: "Invalid OTP code. Please check and try again." });
        }

        otpCache.delete(`login:${user._id.toString()}`);
        user.lastLoginAt = new Date();
        await user.save();
        const token = signToken(user);

        return res.status(200).json({
          success: true,
          message: "Login successful!",
          token,
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            role: user.role,
          },
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: "Session expired or invalid OTP request. Please request a new OTP.",
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



