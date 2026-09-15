import { z } from "zod";

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    mobile: z
      .union([z.string(), z.number()])
      .transform((val) => String(val).trim())
      .refine((val) => /^[6-9]\d{9}$/.test(val), {
        message: "Must be a valid 10-digit Indian mobile number",
      }),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
});

export const verifyRegistrationOtpSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    mobile: z.union([z.string(), z.number()]).optional(),
    password: z.string().min(1, "Password is required"),
  }).refine((data) => data.email || data.mobile, {
    message: "Either email or mobile number must be provided",
  }),
});

export const verifyLoginOtpSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    mobile: z.union([z.string(), z.number()]).optional(),
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
  }).refine((data) => data.email || data.mobile, {
    message: "Either email or mobile number must be provided",
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Please provide a valid registered email address"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    otp: z.string().length(6, "OTP must be 6 digits"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
  }),
});

export const resendOtpSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    mobile: z.union([z.string(), z.number()]).optional(),
  }).refine((data) => data.email || data.mobile, {
    message: "Either email or mobile number is required to resend OTP",
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    mobile: z.union([z.string(), z.number()]).optional(),
  }),
});

// Schema aliases
export const sendOtpSchema = resendOtpSchema;
export const verifyOtpSchema = verifyLoginOtpSchema;

