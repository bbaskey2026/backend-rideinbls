import { z } from "zod";

export const createVehicleSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Vehicle name is required"),
    brand: z.string().default("Executive"),
    category: z.string().default("Sedan"),
    type: z.string().default("sedan"),
    modelYear: z.union([z.number(), z.string()]).optional(),
    capacity: z.number().int().min(1).default(4),
    seats: z.number().int().min(1).default(4),
    luggageCapacity: z.number().int().min(0).default(3),
    pricePerKm: z.number().positive().default(14),
    pricePerKM: z.number().positive().optional(),
    pricePerHour: z.number().positive().optional(),
    baseFare: z.number().min(0).default(500),
    driverAllowancePerDay: z.number().min(0).default(300),
    fuelType: z.string().default("Petrol"),
    transmission: z.string().default("Manual"),
    description: z.string().optional(),
    licensePlate: z.string().optional(),
  }),
});

export const updateVehicleSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    brand: z.string().optional(),
    category: z.string().optional(),
    type: z.string().optional(),
    capacity: z.number().int().min(1).optional(),
    seats: z.number().int().min(1).optional(),
    pricePerKm: z.number().positive().optional(),
    baseFare: z.number().min(0).optional(),
    fuelType: z.string().optional(),
    isAvailable: z.boolean().optional(),
    isBooked: z.boolean().optional(),
    description: z.string().optional(),
  }),
});
