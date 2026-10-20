"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSms = createSms;
exports.createCall = createCall;
exports.listMessages = listMessages;
exports.listCalls = listCalls;
exports.confirmMessage = confirmMessage;
exports.confirmCall = confirmCall;
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
const schemas_1 = require("../lib/schemas");
const socketService_1 = require("../services/socketService");
function deviceOf(req) {
    return req.device;
}
function extractOtp(text) {
    // Strip trailing Android SMS Retriever hash <...>
    const clean = text.replace(/<[a-zA-Z0-9_\-+]{10,12}>/g, "");
    // High-confidence prefix match: supports alphanumeric (e.g. Easypaisa 'VgPr44F96f') and numeric
    const contextualMatch = clean.match(/(?:registration\/login\s+otp\s+is|login\s+otp\s+is|registration\s+otp\s+is|otp\s+is|code\s+is|pin\s+is|verification\s+code\s+is|password\s+is|otp[:\s]+|code[:\s]+|pin[:\s]+)\s*([a-zA-Z0-9]{4,10})/i);
    if (contextualMatch && contextualMatch[1]) {
        const candidate = contextualMatch[1];
        if (candidate === "3737" || candidate === "111003737") {
            return null;
        }
        if (/\d/.test(candidate)) {
            return candidate;
        }
    }
    // Fallback: only if message contains OTP/verification keywords
    if (/\b(otp|code|pin|verification|verify|password)\b/i.test(clean)) {
        const digitMatches = [...clean.matchAll(/\b([0-9]{4,8})\b/g)];
        for (const match of digitMatches) {
            const candidate = match[1];
            if (candidate === "3737" || candidate.includes("3737")) {
                continue;
            }
            const idx = match.index ?? 0;
            const preceding = clean.slice(Math.max(0, idx - 15), idx).toLowerCase();
            if (/call|dial|helpline|rabta|contact/.test(preceding)) {
                continue;
            }
            const following = clean.slice(idx + match[0].length, idx + match[0].length + 10).toLowerCase();
            if (/mb|gb|min|rs|paisa/.test(following)) {
                continue;
            }
            return candidate;
        }
    }
    return null;
}
async function createSms(req, res, next) {
    try {
        const device = deviceOf(req);
        const body = schemas_1.smsSchema.parse(req.body);
        if (body.device_id !== device.externalId) {
            throw new errorHandler_1.HttpError(403, "device_id does not match token");
        }
        // Deduplication: prevent duplicate push within 10-second window
        const tenSecondsAgo = new Date(Date.now() - 10000);
        const existing = await database_1.prisma.message.findFirst({
            where: {
                deviceId: device.id,
                sender: body.sender,
                content: body.message,
                createdAt: { gte: tenSecondsAgo },
            },
        });
        if (existing) {
            res.status(200).json({
                status: "success",
                message_id: existing.id,
                received_at: existing.createdAt.toISOString(),
                duplicate: true,
            });
            return;
        }
        const message = await database_1.prisma.message.create({
            data: {
                deviceId: device.id,
                sender: body.sender,
                content: body.message,
                timestamp: new Date(body.timestamp),
            },
        });
        const otpCode = extractOtp(message.content);
        const payload = {
            id: message.id,
            sender: message.sender,
            message: message.content,
            content: message.content,
            otp_code: otpCode,
            timestamp: message.timestamp.toISOString(),
            synced: message.synced,
        };
        // Emit only once directly to targeted device rooms (prevents double-notification)
        (0, socketService_1.emitToDevice)(device.id, "message:new", payload);
        res.status(201).json({
            status: "success",
            message_id: message.id,
            received_at: message.createdAt.toISOString(),
        });
    }
    catch (err) {
        next(err);
    }
}
async function createCall(req, res, next) {
    try {
        const device = deviceOf(req);
        const body = schemas_1.callSchema.parse(req.body);
        if (body.device_id !== device.externalId) {
            throw new errorHandler_1.HttpError(403, "device_id does not match token");
        }
        const call = await database_1.prisma.callNotification.create({
            data: {
                deviceId: device.id,
                caller: body.caller,
                callState: body.state,
                timestamp: new Date(body.timestamp),
                duration: body.duration ?? 0,
            },
        });
        const callPayload = {
            id: call.id,
            caller: call.caller,
            state: call.callState,
            timestamp: call.timestamp.toISOString(),
            duration: call.duration,
        };
        (0, socketService_1.emitToDevice)(device.id, "call:new", callPayload);
        (0, socketService_1.broadcastToAll)("call:new", callPayload);
        res.status(201).json({
            status: "success",
            call_id: call.id,
        });
    }
    catch (err) {
        next(err);
    }
}
async function getTargetDeviceId(req) {
    const device = deviceOf(req);
    if (device.deviceType === "ios") {
        return undefined;
    }
    return device.id;
}
async function listMessages(req, res, next) {
    try {
        const query = schemas_1.listQuerySchema.parse(req.query);
        const targetDeviceId = await getTargetDeviceId(req);
        const where = {
            ...(targetDeviceId ? { deviceId: targetDeviceId } : {}),
            ...(query.synced === undefined ? {} : { synced: query.synced }),
        };
        const [total, rows] = await Promise.all([
            database_1.prisma.message.count({ where }),
            database_1.prisma.message.findMany({
                where,
                orderBy: { timestamp: "desc" },
                take: query.limit,
                skip: query.offset,
            }),
        ]);
        res.json({
            status: "success",
            data: rows.map((m) => ({
                id: m.id,
                sender: m.sender,
                message: m.content,
                content: m.content,
                otp_code: extractOtp(m.content),
                timestamp: m.timestamp.toISOString(),
                synced: m.synced,
            })),
            total,
            limit: query.limit,
            offset: query.offset,
        });
    }
    catch (err) {
        next(err);
    }
}
async function listCalls(req, res, next) {
    try {
        const query = schemas_1.listQuerySchema.parse(req.query);
        const targetDeviceId = await getTargetDeviceId(req);
        const where = {
            ...(targetDeviceId ? { deviceId: targetDeviceId } : {}),
            ...(query.synced === undefined ? {} : { synced: query.synced }),
        };
        const [total, rows] = await Promise.all([
            database_1.prisma.callNotification.count({ where }),
            database_1.prisma.callNotification.findMany({
                where,
                orderBy: { timestamp: "desc" },
                take: query.limit,
                skip: query.offset,
            }),
        ]);
        res.json({
            status: "success",
            data: rows.map((c) => ({
                id: c.id,
                caller: c.caller,
                state: c.callState,
                timestamp: c.timestamp.toISOString(),
                duration: c.duration,
                synced: c.synced,
                isIncoming: c.callState !== "OUTGOING",
                is_incoming: c.callState !== "OUTGOING",
            })),
            total,
            limit: query.limit,
            offset: query.offset,
        });
    }
    catch (err) {
        next(err);
    }
}
async function confirmMessage(req, res, next) {
    try {
        const id = req.params.id;
        const targetDeviceId = await getTargetDeviceId(req);
        const result = await database_1.prisma.message.updateMany({
            where: { id, deviceId: targetDeviceId },
            data: { synced: true, syncedAt: new Date() },
        });
        if (result.count === 0) {
            throw new errorHandler_1.HttpError(404, "Message not found");
        }
        res.json({ status: "success" });
    }
    catch (err) {
        next(err);
    }
}
async function confirmCall(req, res, next) {
    try {
        const id = req.params.id;
        const targetDeviceId = await getTargetDeviceId(req);
        const result = await database_1.prisma.callNotification.updateMany({
            where: { id, deviceId: targetDeviceId },
            data: { synced: true, syncedAt: new Date() },
        });
        if (result.count === 0) {
            throw new errorHandler_1.HttpError(404, "Call not found");
        }
        res.json({ status: "success" });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=messagesController.js.map