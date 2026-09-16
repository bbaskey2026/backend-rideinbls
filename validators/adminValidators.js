import { z } from "zod";

export const userIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "User ID is required"),
  }),
});

export const updateUserRoleSchema = z.object({
  params: z.object({
    id: z.string().min(1, "User ID is required"),
  }),
  body: z.object({
    role: z.enum(["user", "admin", "manager", "driver", "moderator"]),
  }),
});
