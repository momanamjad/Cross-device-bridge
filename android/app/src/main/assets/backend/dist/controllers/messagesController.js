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
async function createSms(req, res, next) {
    try {
        const device = deviceOf(req);
        const body = schemas_1.smsSchema.parse(req.body);
        if (body.device_id !== device.externalId) {
            throw new errorHandler_1.HttpError(403, "device_id does not match token");
        }
        const message = await database_1.prisma.message.create({
            data: {
                deviceId: device.id,
                sender: body.sender,
                content: body.message,
                timestamp: new Date(body.timestamp),
            },
        });
        const payload = {
            id: message.id,
            sender: message.sender,
            message: message.content,
            content: message.content,
            timestamp: message.timestamp.toISOString(),
            synced: message.synced,
        };
        (0, socketService_1.emitToDevice)(device.id, "message:new", payload);
        (0, socketService_1.broadcastToAll)("message:new", payload);
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
        const androidDevice = await database_1.prisma.device.findFirst({
            where: { deviceType: "android", isActive: true },
        });
        if (androidDevice) {
            return androidDevice.id;
        }
    }
    return device.id;
}
async function listMessages(req, res, next) {
    try {
        const query = schemas_1.listQuerySchema.parse(req.query);
        const targetDeviceId = await getTargetDeviceId(req);
        const where = {
            deviceId: targetDeviceId,
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
            deviceId: targetDeviceId,
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