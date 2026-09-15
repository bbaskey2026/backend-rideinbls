import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

let transporterInstance = null;

export const getMailerTransporter = () => {
  if (!transporterInstance) {
    const user = (process.env.EMAIL_USER || "").trim();
    const pass = (process.env.EMAIL_PASS || "").replace(/\s+/g, "");

    if (user && pass && pass !== "your_email_app_password") {
      transporterInstance = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user,
          pass,
        },
        pool: true,
        maxConnections: 5,
      });
    } else {
      console.warn("⚠️ EMAIL_USER or EMAIL_PASS not set. Using JSON log transport for local testing.");
      transporterInstance = nodemailer.createTransport({
        jsonTransport: true,
      });
    }
  }
  return transporterInstance;
};


export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = getMailerTransporter();
    const info = await transporter.sendMail({
      from: `"RideInBls Support" <${process.env.EMAIL_USER || "noreply@rideinbls.com"}>`,
      to,
      subject,
      text: text || "RideInBls Notification",
      html,
    });
    return { success: true, info };
  } catch (err) {
    console.error("Email delivery failed:", err.message);
    return { success: false, error: err.message };
  }
};

export const getOTPEmailTemplate = (otp, type = "login", userName = "") => {
  const isLogin = type === "login";
  const isForgot = type === "forgot";
  const title = isLogin
    ? "Your Login Verification Code"
    : isForgot
    ? "Reset Your Password"
    : "Verify Your New Account";

  return {
    subject: `RideInBls Verification Code: ${otp}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: #000000; color: #ededed; border: 1px solid #222222; border-radius: 12px; padding: 32px;">
        <h2 style="color: #ffffff; margin-top: 0; font-size: 22px; letter-spacing: -0.02em;">${title}</h2>
        <p style="color: #888888; font-size: 14px; line-height: 1.6;">Hello ${userName || "Valued Rider"},</p>
        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6;">Please use the following 6-digit One-Time Password to proceed. This code expires in 10 minutes.</p>
        
        <div style="background: #0d0d0d; border: 1px solid #27272a; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
          <span style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #ffffff;">${otp}</span>
        </div>
        
        <p style="color: #52525b; font-size: 12px; margin-bottom: 0;">If you did not request this OTP, you can safely disregard this email.</p>
      </div>
    `,
  };
};

export const getBookingConfirmationEmail = (booking) => {
  return {
    subject: `Booking Confirmed: ${booking.bookingCode} - RideInBls`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; background: #000000; color: #ededed; border: 1px solid #222222; border-radius: 12px; padding: 32px;">
        <h2 style="color: #ffffff; margin-top: 0; font-size: 22px; letter-spacing: -0.02em;">Booking Confirmed!</h2>
        <p style="color: #888888; font-size: 14px;">Booking Reference: <strong style="color: #fff; font-family: monospace;">${booking.bookingCode}</strong></p>
        
        <div style="background: #0d0d0d; border: 1px solid #1f1f1f; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 6px 0; color: #a1a1aa; font-size: 13px;"><strong>Pickup:</strong> <span style="color: #fff;">${booking.origin}</span></p>
          <p style="margin: 6px 0; color: #a1a1aa; font-size: 13px;"><strong>Dropoff:</strong> <span style="color: #fff;">${booking.destination}</span></p>
          <p style="margin: 6px 0; color: #a1a1aa; font-size: 13px;"><strong>Total Amount:</strong> <span style="color: #10b981; font-weight: bold;">₹${booking.totalPrice} (PAID)</span></p>
        </div>
        
        <p style="color: #52525b; font-size: 12px;">Your chauffeur details will be shared 30 minutes prior to departure. Thank you for riding with RideInBls!</p>
      </div>
    `,
  };
};

export const getRefundConfirmationEmail = (booking, refundAmount, reason) => {
  return {
    subject: `Refund Processed: ${booking.bookingCode} - RideInBls`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; background: #000000; color: #ededed; border: 1px solid #222222; border-radius: 12px; padding: 32px;">
        <h2 style="color: #ffffff; margin-top: 0; font-size: 22px; letter-spacing: -0.02em;">Cancellation & Refund Processed</h2>
        <p style="color: #888888; font-size: 14px;">Your booking <strong style="color: #fff; font-family: monospace;">${booking.bookingCode}</strong> has been cancelled.</p>
        
        <div style="background: #0d0d0d; border: 1px solid #1f1f1f; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 6px 0; color: #a1a1aa; font-size: 13px;"><strong>Refund Amount:</strong> <span style="color: #34d399; font-weight: bold;">₹${refundAmount}</span></p>
          <p style="margin: 6px 0; color: #a1a1aa; font-size: 13px;"><strong>Original Fare:</strong> ₹${booking.totalPrice}</p>
          <p style="margin: 6px 0; color: #a1a1aa; font-size: 13px;"><strong>Reason:</strong> ${reason || "Customer requested cancellation"}</p>
        </div>
        
        <p style="color: #71717a; font-size: 13px; line-height: 1.5;">The refunded amount will reflect in your source payment account / UPI within 24 to 48 banking hours.</p>
      </div>
    `,
  };
};
