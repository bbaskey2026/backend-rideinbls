// services/authService.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { sendEmail, getOTPEmailTemplate } from "../config/mailer.js";
import { logger } from "../middleware/logger.js";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "rideinbls_jwt_fallback_secret_key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

class AuthService {
  constructor() {
    this.otpCache = new Map();
  }

  generateNumericOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  signToken(user) {
    const userId = user._id ?? user.id;
    const email = user.email ?? null;
    const role = user.role ?? "user";

    return jwt.sign(
      { _id: userId, id: userId, email, role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  async findUserByIdentifier(identifier) {
    if (!identifier) return null;
    const cleanId = String(identifier).toLowerCase().trim();

    if (cleanId.includes("@")) {
      return await User.findOne({ email: cleanId });
    }
    return await User.findOne({
      $or: [{ email: cleanId }, { mobile: cleanId }],
    });
  }

  /**
   * 1. Register: Validate & Send Registration OTP
   */
  async register(reqData = {}) {
    const name = reqData.name ?? "";
    const email = (reqData.email ?? "").toLowerCase().trim();
    const mobile = String(reqData.mobile ?? "").trim();
    const password = reqData.password ?? "";

    logger.info(`[AuthService] Processing user registration for email: ${email}`);

    const existingUser = await User.findOne({
      $or: [{ email }, { mobile }],
    });

    if (existingUser) {
      const error = new Error("An account with this email or mobile number already exists.");
      error.statusCode = 400;
      throw error;
    }

    const otp = this.generateNumericOTP();

    this.otpCache.set(`reg:${email}`, {
      name,
      email,
      mobile,
      password,
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    const emailData = getOTPEmailTemplate(otp, "register", name);
    await sendEmail({ to: email, ...emailData });

    return {
      message: "Verification OTP sent to your registered email address.",
      otp: process.env.NODE_ENV !== "production" ? otp : undefined,
    };
  }

  /**
   * 2. Verify Registration OTP and Create User Record
   */
  async verifyRegistrationOtp(reqData = {}) {
    const email = (reqData.email ?? "").toLowerCase().trim();
    const otp = String(reqData.otp ?? "").trim();

    logger.info(`[AuthService] Verifying registration OTP for: ${email}`);

    const cached = this.otpCache.get(`reg:${email}`);
    if (!cached) {
      const error = new Error("Registration session expired. Please register again.");
      error.statusCode = 400;
      throw error;
    }

    if (cached.expiresAt < Date.now()) {
      this.otpCache.delete(`reg:${email}`);
      const error = new Error("OTP has expired. Please request a new one.");
      error.statusCode = 400;
      throw error;
    }

    if (cached.otp !== otp) {
      const error = new Error("Invalid OTP code. Please check your email and try again.");
      error.statusCode = 400;
      throw error;
    }

    const newUser = await User.create({
      name: cached.name,
      email: cached.email,
      mobile: cached.mobile,
      password: cached.password,
      role: "user",
      isActive: true,
    });

    this.otpCache.delete(`reg:${email}`);
    const token = this.signToken(newUser);

    return {
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        mobile: newUser.mobile,
        role: newUser.role,
      },
      token,
    };
  }

  /**
   * 3. Login: Authenticate credentials and send Login OTP
   */
  async login(reqData = {}) {
    const identifier = reqData.identifier ?? reqData.email ?? reqData.mobile ?? "";
    const password = reqData.password ?? "";

    logger.info(`[AuthService] Login attempt for identifier: ${identifier}`);

    const user = await this.findUserByIdentifier(identifier);
    if (!user) {
      const error = new Error("No registered account found with these credentials.");
      error.statusCode = 404;
      throw error;
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      const error = new Error("Incorrect password. Please try again.");
      error.statusCode = 401;
      throw error;
    }

    if (user.isActive === false) {
      const error = new Error("Account is suspended. Please contact customer support.");
      error.statusCode = 403;
      throw error;
    }

    const otp = this.generateNumericOTP();
    this.otpCache.set(`login:${user._id.toString()}`, {
      userId: user._id,
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    const emailData = getOTPEmailTemplate(otp, "login", user.name);
    await sendEmail({ to: user.email, ...emailData });

    return {
      userEmail: user.email,
      otp: process.env.NODE_ENV !== "production" ? otp : undefined,
    };
  }

  /**
   * 4. Verify Login OTP and issue JWT
   */
  async verifyLoginOtp(reqData = {}) {
    const identifier = reqData.identifier ?? reqData.email ?? reqData.mobile ?? "";
    const otp = String(reqData.otp ?? "").trim();

    logger.info(`[AuthService] Verifying login OTP for: ${identifier}`);

    const user = await this.findUserByIdentifier(identifier);
    if (!user) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    const cached = this.otpCache.get(`login:${user._id.toString()}`);
    if (!cached) {
      const error = new Error("Login session expired. Please sign in again.");
      error.statusCode = 400;
      throw error;
    }

    if (cached.expiresAt < Date.now()) {
      this.otpCache.delete(`login:${user._id.toString()}`);
      const error = new Error("OTP expired. Please request a new one.");
      error.statusCode = 400;
      throw error;
    }

    if (cached.otp !== otp) {
      const error = new Error("Invalid OTP code. Please check and try again.");
      error.statusCode = 400;
      throw error;
    }

    this.otpCache.delete(`login:${user._id.toString()}`);
    user.lastLoginAt = new Date();
    await user.save();

    const token = this.signToken(user);

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
      },
      token,
    };
  }

  /**
   * 5. Resend OTP
   */
  async resendOtp(reqData = {}) {
    const identifier = reqData.identifier ?? reqData.email ?? reqData.mobile ?? "";
    const user = await this.findUserByIdentifier(identifier);
    const targetEmail = user ? user.email : String(identifier).toLowerCase().trim();
    const otp = this.generateNumericOTP();

    if (user) {
      this.otpCache.set(`login:${user._id.toString()}`, {
        userId: user._id,
        otp,
        expiresAt: Date.now() + OTP_EXPIRY_MS,
      });
    } else {
      const reg = this.otpCache.get(`reg:${targetEmail}`);
      if (reg) {
        reg.otp = otp;
        reg.expiresAt = Date.now() + OTP_EXPIRY_MS;
        this.otpCache.set(`reg:${targetEmail}`, reg);
      }
    }

    const emailData = getOTPEmailTemplate(otp, "login", user?.name ?? "");
    await sendEmail({ to: targetEmail, ...emailData });

    return {
      otp: process.env.NODE_ENV !== "production" ? otp : undefined,
    };
  }

  /**
   * 6. Forgot Password: Send reset OTP
   */
  async forgotPassword(reqData = {}) {
    const email = (reqData.email ?? "").toLowerCase().trim();
    const user = await User.findOne({ email });

    if (!user) {
      const error = new Error("No account found with this email address.");
      error.statusCode = 404;
      throw error;
    }

    const otp = this.generateNumericOTP();
    this.otpCache.set(`reset:${email}`, {
      userId: user._id,
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    const emailData = getOTPEmailTemplate(otp, "forgot", user.name);
    await sendEmail({ to: email, ...emailData });

    return {
      otp: process.env.NODE_ENV !== "production" ? otp : undefined,
    };
  }

  /**
   * 7. Reset Password
   */
  async resetPassword(reqData = {}) {
    const email = (reqData.email ?? "").toLowerCase().trim();
    const otp = String(reqData.otp ?? "").trim();
    const newPassword = reqData.newPassword ?? "";

    const cached = this.otpCache.get(`reset:${email}`);
    if (!cached || cached.otp !== otp) {
      const error = new Error("Invalid or expired reset OTP code.");
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(cached.userId);
    if (!user) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    user.password = newPassword;
    await user.save();

    this.otpCache.delete(`reset:${email}`);
    return true;
  }

  /**
   * 8. Unified OTP verification
   */
  async verifyOtp(reqData = {}) {
    const identifier = (reqData.identifier ?? reqData.email ?? reqData.mobile ?? "").toLowerCase().trim();
    const otp = String(reqData.otp ?? "").trim();

    // Check Registration Cache
    const regCached = this.otpCache.get(`reg:${identifier}`);
    if (regCached) {
      if (regCached.expiresAt < Date.now()) {
        this.otpCache.delete(`reg:${identifier}`);
        const error = new Error("OTP has expired. Please register again.");
        error.statusCode = 400;
        throw error;
      }

      if (regCached.otp !== otp) {
        const error = new Error("Invalid OTP code. Please check and try again.");
        error.statusCode = 400;
        throw error;
      }

      const newUser = await User.create({
        name: regCached.name,
        email: regCached.email,
        mobile: regCached.mobile,
        password: regCached.password,
        role: "user",
        isActive: true,
      });

      this.otpCache.delete(`reg:${identifier}`);
      const token = this.signToken(newUser);

      return {
        type: "register",
        user: {
          _id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          mobile: newUser.mobile,
          role: newUser.role,
        },
        token,
      };
    }

    // Check Login Cache
    const user = await this.findUserByIdentifier(identifier);
    if (user) {
      const loginCached = this.otpCache.get(`login:${user._id.toString()}`);
      if (loginCached) {
        if (loginCached.expiresAt < Date.now()) {
          this.otpCache.delete(`login:${user._id.toString()}`);
          const error = new Error("Login OTP expired. Please request a new code.");
          error.statusCode = 400;
          throw error;
        }

        if (loginCached.otp !== otp) {
          const error = new Error("Invalid OTP code. Please check and try again.");
          error.statusCode = 400;
          throw error;
        }

        this.otpCache.delete(`login:${user._id.toString()}`);
        user.lastLoginAt = new Date();
        await user.save();
        const token = this.signToken(user);

        return {
          type: "login",
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            role: user.role,
          },
          token,
        };
      }
    }

    const error = new Error("Session expired or invalid OTP request. Please request a new OTP.");
    error.statusCode = 400;
    throw error;
  }
}

const authService = new AuthService();
export default authService;
export { AuthService, authService };
