"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listQuerySchema = exports.callSchema = exports.smsSchema = exports.registerDeviceSchema = void 0;
const zod_1 = require("zod");
exports.registerDeviceSchema = zod_1.z.object({
    device_id: zod_1.z.string().min(1).max(128),
    device_name: zod_1.z.string().min(1).max(128),
    device_type: zod_1.z.string().min(1).max(32).default("android"),
    os_version: zod_1.z.string().max(64).optional().default(""),
});
exports.smsSchema = zod_1.z.object({
    sender: zod_1.z.string().min(1).max(64),
    message: zod_1.z.string().min(0).max(8000),
    timestamp: zod_1.z.number().int().positive(),
    device_id: zod_1.z.string().min(1).max(128),
});
exports.callSchema = zod_1.z.object({
    caller: zod_1.z.string().min(1).max(64),
    state: zod_1.z.enum(["RINGING", "OFFHOOK", "IDLE", "INCOMING", "OUTGOING", "MISSED"]),
    timestamp: zod_1.z.number().int().positive(),
    device_id: zod_1.z.string().min(1).max(128),
    duration: zod_1.z.number().int().min(0).optional().default(0),
});
exports.listQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(200).optional().default(50),
    offset: zod_1.z.coerce.number().int().min(0).optional().default(0),
    synced: zod_1.z
        .enum(["true", "false"])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
});
