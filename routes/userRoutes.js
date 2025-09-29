// routes/auth.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import User from "../models/User.js";
import { authMiddleware } from "../middleware/auth.js";
import crypto from "crypto";
import dotenv from "dotenv";
const router = express.Router();
dotenv.config();
// -------------------- OTP store --------------------
// Using a Map for OTPs: { email => { otp, userData, type, expiry, attempts, userId? } }
const otpStore = new Map();
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 3;

// -------------------- Nodemailer --------------------
const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // use App Password for Gmail
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    tls: { rejectUnauthorized: true },
  });
};

// Email HTML template generator
const getOTPEmailTemplate = (otp, type, userName = "") => {
  const isLogin = type === "login";
  const isForgot = type === "forgot";

  return {
    subject: isLogin
      ? "Login OTP - RideInBls"
      : isForgot
      ? "Reset Password OTP - RideInBls"
      : "Registration OTP - RideInBls",

    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>RideInBls OTP</title>
          <style>
            /* Mobile responsive adjustments */
            @media only screen and (max-width: 600px) {
              h1 {
                font-size: 20px !important;
              }
              h2 {
                font-size: 18px !important;
              }
              p {
                font-size: 14px !important;
              }
              .otp-box h1 {
                font-size: 26px !important;
                letter-spacing: 4px !important;
              }
              .container {
                padding: 15px !important;
              }
            }
          </style>
        </head>
        <body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color:#f4f4f4;">
          <table width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f4; padding:20px 0;">
            <tr>
              <td>
                <table class="main-wrapper" width="100%" style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden;" cellspacing="0" cellpadding="0">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background-color:#007bff; padding:20px; text-align:center;">
                      <h1 style="color:#ffffff; margin:0; font-size:24px;">RideInBls</h1>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td class="container" style="padding:30px;">
                      <h2 style="color:#333; margin-bottom:15px; font-size:20px;">
                        ${
                          isLogin
                            ? `Welcome back${userName ? `, ${userName}` : ""}!`
                            : isForgot
                            ? "Password Reset Request"
                            : "Welcome to RideInBls!"
                        }
                      </h2>

                      <p style="color:#555; font-size:15px; line-height:1.6; margin-bottom:20px;">
                        ${
                          isLogin
                            ? "You requested to login to your account. Please use the OTP below to complete your login:"
                            : isForgot
                            ? "You requested to reset your password. Please use the OTP below to reset your password:"
                            : "Thank you for registering with RideInBls. Please use the OTP below to verify your email and complete your registration:"
                        }
                      </p>

                      <div class="otp-box" style="background-color:#f8f9fa; padding:25px; text-align:center; border-radius:6px; margin:25px 0;">
                        <h1 style="color:#007bff; font-size:32px; margin:0; letter-spacing:6px; font-weight:bold;">
                          ${otp}
                        </h1>
                        <p style="color:#777; margin-top:12px; font-size:14px;">This OTP is valid for 10 minutes</p>
                      </div>

                      <p style="color:#666; font-size:14px; line-height:1.5;">
                        <strong>Security Note:</strong> Never share this OTP with anyone. RideInBls team will never ask for your OTP over phone or email.
                      </p>

                      <p style="color:#999; font-size:12px; margin-top:25px;">
                        If you didn't request this OTP, please ignore this email or contact our support team.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color:#f8f9fa; text-align:center; padding:15px; font-size:12px; color:#666;">
                      <p style="margin:5px 0;">© ${new Date().getFullYear()} RideInBls. All rights reserved.</p>
                      <p style="margin:5px 0;">For support, contact us at <a href="mailto:rideinbls@gmail.com" style="color:#007bff; text-decoration:none;">rideinbls@gmail.com</a></p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };
};


const sendOTPEmail = async (email, otp, type = "register", userName = "") => {
  try {
    const transporter = createTransporter();
    const template = getOTPEmailTemplate(otp, type, userName);

    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || "RideInBls"} <${process.env.EMAIL_USER}>`,
      to: email,
      subject: template.subject,
      html: template.html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("OTP email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("sendOTPEmail error:", err);
    return { success: false, error: err.message };
  }
};

// -------------------- Helpers --------------------
const generateOTP = (length = 6) => {
  const digits = "0123456789";
  const bytes = crypto.randomBytes(length);
  let otp = "";

  for (let i = 0; i < length; i++) {
    otp += digits[bytes[i] % digits.length];
  }

  return otp;
};

const storeOTP = (email, otp, userData = null, type = "register") => {
  const expiry = Date.now() + OTP_TTL_MS;
  otpStore.set(email, { otp, userData, type, expiry, attempts: 0 });
};

const validateOTP = (email, inputOtp) => {
  const record = otpStore.get(email);
  if (!record) return { valid: false, error: "No OTP found for this email" };

  if (Date.now() > record.expiry) {
    otpStore.delete(email);
    return { valid: false, error: "OTP has expired" };
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    otpStore.delete(email);
    return { valid: false, error: "Too many failed attempts. Please request a new OTP." };
  }

  if (record.otp !== inputOtp) {
    record.attempts++;
    // update back
    otpStore.set(email, record);
    return { valid: false, error: "Invalid OTP" };
  }

  // OTP valid
  return { valid: true, record };
};

const sendResponse = (res, status, success, message, data = null) =>
  res.status(status).json({ success, message, data });

// Cleanup expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, record] of otpStore.entries()) {
    if (now > record.expiry) otpStore.delete(email);
  }
}, 15 * 60 * 1000);

// -------------------- Routes --------------------

// REGISTER - request OTP and store pending userData
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return sendResponse(res, 400, false, "Name, email, and password are required");

    if (password.length < 6) return sendResponse(res, 400, false, "Password must be at least 6 characters long");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return sendResponse(res, 400, false, "Please provide a valid email address");

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return sendResponse(res, 400, false, "User with this email already exists");

    const hashedPassword = await bcrypt.hash(password, 12);

    // Load admin emails from .env

// Single admin email configuration
const adminEmail = process.env.ADMIN_EMAIL 
  ? process.env.ADMIN_EMAIL.trim().toLowerCase() 
  : "";

// Usage example: Check if user is admin
const isAdmin = (userEmail) => {
  return userEmail.trim().toLowerCase() === adminEmail;
};

// Example in your auth logic
const role = isAdmin(email) ? "admin" : "user";

// In your .env file:
// ADMIN_EMAIL=admin@example.com

    const otp = generateOTP();
    const userData = {
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
    };

    storeOTP(email.toLowerCase(), otp, userData, "register");

    const emailResult = await sendOTPEmail(email.toLowerCase(), otp, "register", name.trim());
    if (!emailResult.success) {
      console.error("Registration OTP send failed:", emailResult.error);
      // continue but inform client
    }

    return sendResponse(res, 200, true, "OTP sent to your email. Please verify to complete registration.", {
      email: email.toLowerCase(),
      emailSent: emailResult.success,
      otp: process.env.NODE_ENV === "development" ? otp : undefined,
    });
  } catch (err) {
    console.error("Register error:", err);
    return sendResponse(res, 500, false, "Registration failed. Please try again.");
  }
});

// VERIFY REGISTER OTP - create user and return token
router.post("/register/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return sendResponse(res, 400, false, "Email and OTP are required");

    const validation = validateOTP(email.toLowerCase(), otp);
    if (!validation.valid) return sendResponse(res, 400, false, validation.error);

    const { userData, type } = validation.record;
    if (!userData || type !== "register") return sendResponse(res, 400, false, "Invalid registration attempt");

    // create user
    const user = await User.create(userData);

    // sign token with _id (so req.user._id is available)
    const token = jwt.sign(
      { _id: user._id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "48h" }
    );

    otpStore.delete(email.toLowerCase());
    
    res.status(200).json({
      success: true,
      message: "Registration verified successfully",
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      token,
    });
  } catch (err) {
    console.error("Register verify error:", err);
    return sendResponse(res, 500, false, "Verification failed. Please try again.");
  }
});

// LOGIN - generate OTP and send to email (no passwordless fallback here)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return sendResponse(res, 400, false, "Email and password are required");

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return sendResponse(res, 400, false, "Invalid email or password");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return sendResponse(res, 400, false, "Invalid email or password");

    if (user.status && user.status === "inactive") {
      return sendResponse(res, 400, false, "Account is inactive. Please contact support.");
    }

    const otp = generateOTP();
    storeOTP(email.toLowerCase(), otp, null, "login");

    // attach userId so verify step can create token
    const rec = otpStore.get(email.toLowerCase());
    if (rec) rec.userId = user._id;

    const emailResult = await sendOTPEmail(email.toLowerCase(), otp, "login", user.name);
    if (!emailResult.success) {
      console.error("Login OTP send failed:", emailResult.error);
    }

    return sendResponse(res, 200, true, "OTP sent to your email. Please verify to complete login.", {
      email: email.toLowerCase(),
      emailSent: emailResult.success,
      otp: process.env.NODE_ENV === "development" ? otp : undefined,
    });
  } catch (err) {
    console.error("Login error:", err);
    return sendResponse(res, 500, false, "Login failed. Please try again.");
  }
});

// VERIFY LOGIN OTP - issue JWT
router.post("/login/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) 
      return sendResponse(res, 400, false, "Email and OTP are required");

    const validation = validateOTP(email.toLowerCase(), otp);
    if (!validation.valid) 
      return sendResponse(res, 400, false, validation.error);

    const { userId, type } = validation.record;
    if (!userId || type !== "login") 
      return sendResponse(res, 400, false, "Invalid login attempt");

    const user = await User.findById(userId).select("-password");
    if (!user) 
      return sendResponse(res, 400, false, "User account not found");

    // ✅ Update last login time
    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      { _id: user._id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "48h" }
    );

    // ✅ Increment login count if you track it (lastLoginAt field updated)
    await User.findByIdAndUpdate(userId, { $inc: { loginCount: 1 } });

    // Remove OTP from store
    otpStore.delete(email.toLowerCase());

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
      },
      token,
    });
  } catch (err) {
    console.error("Login verify error:", err);
    return sendResponse(res, 500, false, "Login verification failed. Please try again.");
  }
});

// RESEND OTP
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return sendResponse(res, 400, false, "Email is required");

    const rec = otpStore.get(email.toLowerCase());
    if (!rec) return sendResponse(res, 400, false, "No active OTP request found for this email");

    const newOTP = generateOTP();
    rec.otp = newOTP;
    rec.expiry = Date.now() + OTP_TTL_MS;
    rec.attempts = 0;
    otpStore.set(email.toLowerCase(), rec);

    const emailResult = await sendOTPEmail(email.toLowerCase(), newOTP, rec.type, rec.userData?.name || "");
    if (!emailResult.success) {
      console.error("Resend OTP email failed:", emailResult.error);
    }

    return sendResponse(res, 200, true, "New OTP sent successfully", {
      email: email.toLowerCase(),
      emailSent: emailResult.success,
      otp: process.env.NODE_ENV === "development" ? newOTP : undefined,
    });
  } catch (err) {
    console.error("Resend OTP error:", err);
    return sendResponse(res, 500, false, "Failed to resend OTP. Please try again.");
  }
});

// GET CURRENT USER - protected
router.get("/me", authMiddleware, async (req, res) => {
  try {
    // prefer fresh data from DB
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return sendResponse(res, 404, false, "User not found");

    return sendResponse(res, 200, true, "User details retrieved successfully", {
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        createdAt: user.createdAt 
      },
    });
  } catch (err) {
    console.error("Get current user error:", err);
    return sendResponse(res, 500, false, "Failed to get user details");
  }
});

// LOGOUT - protected (stateless JWT; update lastLogout optionally)
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { lastLogout: new Date() });
    // client should delete token; server-side logout may use blacklist (not implemented here)
    return sendResponse(res, 200, true, "Logged out successfully");
  } catch (err) {
    console.error("Logout error:", err);
    return sendResponse(res, 500, false, "Logout failed");
  }
});

// FORGOT PASSWORD
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return sendResponse(res, 400, false, "Email is required");

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return sendResponse(res, 404, false, "No user found with this email");

    const otp = generateOTP();
    storeOTP(email.toLowerCase(), otp, null, "forgot");

    const emailResult = await sendOTPEmail(email.toLowerCase(), otp, "forgot", user.name);
    if (!emailResult.success) console.error("Forgot password OTP send failed:", emailResult.error);

    return sendResponse(res, 200, true, "OTP sent to your email", {
      email: email.toLowerCase(),
      emailSent: emailResult.success,
      otp: process.env.NODE_ENV === "development" ? otp : undefined,
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return sendResponse(res, 500, false, "Failed to send OTP. Please try again.");
  }
});

// RESET PASSWORD
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return sendResponse(res, 400, false, "Email, OTP, and new password are required");

    if (newPassword.length < 6)
      return sendResponse(res, 400, false, "Password must be at least 6 characters long");

    const validation = validateOTP(email.toLowerCase(), otp);
    if (!validation.valid) return sendResponse(res, 400, false, validation.error);

    const { type } = validation.record;
    if (type !== "forgot") return sendResponse(res, 400, false, "Invalid password reset attempt");

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await User.findOneAndUpdate({ email: email.toLowerCase() }, { password: hashedPassword });

    otpStore.delete(email.toLowerCase());

    return sendResponse(res, 200, true, "Password reset successfully");
  } catch (err) {
    console.error("Reset password error:", err);
    return sendResponse(res, 500, false, "Failed to reset password. Please try again.");
  }
});

export default router;