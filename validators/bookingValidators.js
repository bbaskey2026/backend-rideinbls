import { z } from "zod";

export const createOrderSchema = z.object({
  body: z.object({
    vehicleId: z.string().min(1, "Vehicle ID is required"),
    amount: z.number().positive("Amount must be greater than zero"),
    origin: z.string().min(1, "Pickup origin is required"),
    destination: z.string().min(1, "Dropoff destination is required"),
    isRoundTrip: z.boolean().default(false),
    startDate: z.string().or(z.date()).optional(),
    endDate: z.string().or(z.date()).optional(),
  }),
});

export const verifyPaymentSchema = z.object({
  body: z.object({
    razorpay_order_id: z.string().min(1, "Razorpay Order ID required"),
    razorpay_payment_id: z.string().min(1, "Razorpay Payment ID required"),
    razorpay_signature: z.string().min(1, "Razorpay Signature required"),
  }),
});

export const cancelBookingSchema = z.object({
  params: z
    .object({
      id: z.string().optional(),
    })
    .optional(),
  body: z
    .object({
      bookingId: z.string().optional(),
      vehicleId: z.string().optional(),
      id: z.string().optional(),
      reason: z.string().optional().default("Customer cancelled booking"),
    })
    .optional()
    .default({}),
});

export const processRefundSchema = z.object({
  params: z
    .object({
      id: z.string().optional(),
    })
    .optional(),
  body: z
    .object({
      bookingId: z.string().optional(),
      id: z.string().optional(),
      amount: z.number().positive().optional(),
      reason: z.string().optional().default("Admin processed refund"),
      speed: z.enum(["normal", "optimum"]).default("normal"),
    })
    .optional()
    .default({}),
});

export const calculateFareSchema = z.object({
  body: z
    .object({
      vehicleId: z.string().optional(),
      distanceKm: z.union([z.number(), z.string()]).optional(),
      distance: z.union([z.number(), z.string()]).optional(),
      durationHours: z.union([z.number(), z.string()]).optional(),
      hours: z.union([z.number(), z.string()]).optional(),
      isRoundTrip: z.boolean().optional().default(false),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      gstPercent: z.number().optional().default(5),
    })
    .optional()
    .default({}),
});

export const refundBookingSchema = processRefundSchema;

