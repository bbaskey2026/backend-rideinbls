import { z } from "zod";

export const driverOnboardSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Full name required"),
    email: z.string().email("Valid email required"),
    mobile: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .refine((v) => /^[6-9]\d{9}$/.test(v), { message: "10-digit mobile number required" }),
    licenseNumber: z.string().min(4, "Driving license number is required"),
    experienceYears: z.union([z.number(), z.string()]).default(3),
    vehicleModel: z.string().min(2, "Vehicle model is required"),
    vehicleNumber: z.string().min(4, "Vehicle registration number is required"),
    city: z.string().default("Balasore"),
  }),
});

export const driverRegistrationSchema = driverOnboardSchema;

