import { z } from "zod";

export const registerDeviceSchema = z.object({
  device_id: z.string().min(1).max(128),
  device_name: z.string().min(1).max(128),
  device_type: z.string().min(1).max(32).default("android"),
  os_version: z.string().max(64).optional().default(""),
});

export const smsSchema = z.object({
  sender: z.string().min(1).max(64),
  message: z.string().min(0).max(8000),
  timestamp: z.number().int().positive(),
  device_id: z.string().min(1).max(128),
});

export const callSchema = z.object({
  caller: z.string().min(1).max(64),
  state: z.enum(["RINGING", "OFFHOOK", "IDLE", "INCOMING", "OUTGOING", "MISSED"]),
  timestamp: z.number().int().positive(),
  device_id: z.string().min(1).max(128),
  duration: z.number().int().min(0).optional().default(0),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  synced: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});
