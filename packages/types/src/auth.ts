import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // Authenticator code or recovery code, once two-factor auth is on.
  totp: z.string().trim().min(6).max(20).optional(),
  // Stay signed in on this device for 30 days instead of 12 hours.
  rememberMe: z.boolean().optional(),
});
export type LoginDto = z.infer<typeof loginSchema>;

// Indian mobile, as typed: spaces, +91 or a leading 0 are fine.
const ownerPhoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, ""))
  .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit WhatsApp number");

export const registerSchema = z.object({
  restaurantName: z.string().min(1),
  branchName: z.string().min(1).default("Main Branch"),
  ownerName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  // The owner's WhatsApp number, verified with a one-time code
  // (POST /auth/register/otp) when WhatsApp is set up on the server.
  phone: ownerPhoneSchema,
  otpCode: z.string().regex(/^\d{6}$/, "Enter the 6-digit code").optional(),
});

export const registerOtpSchema = z.object({
  phone: ownerPhoneSchema,
  ownerName: z.string().trim().max(60).optional(),
});
export type RegisterOtpDto = z.infer<typeof registerOtpSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;

export const pinLoginSchema = z.object({
  userId: z.string(),
  pin: z.string().min(4).max(8),
});
export type PinLoginDto = z.infer<typeof pinLoginSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  name: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  permissions: z.array(z.string()),
  // Platform operator (F Cartel super admin) — see /admin.
  isSuperAdmin: z.boolean().optional(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const twoFactorCodeSchema = z.object({ code: z.string().trim().min(6).max(20) });
export const twoFactorDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().min(6).max(20),
});
