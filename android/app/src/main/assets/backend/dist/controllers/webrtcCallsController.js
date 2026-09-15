"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restTestSignalSchema = exports.restEndedSchema = exports.restOutgoingSchema = exports.restIncomingSchema = void 0;
exports.handleIncomingCallRest = handleIncomingCallRest;
exports.handleOutgoingCallRest = handleOutgoingCallRest;
exports.handleEndedCallRest = handleEndedCallRest;
exports.handleHealthRest = handleHealthRest;
exports.handleStatsRest = handleStatsRest;
exports.handleTestSignalRest = handleTestSignalRest;
exports.handleHistoryRest = handleHistoryRest;
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
const webrtcSignal_1 = require("../services/webrtcSignal");
const socketService_1 = require("../services/socketService");
const winstonLogger_1 = require("../lib/winstonLogger");
const crypto_2 = require("../lib/crypto");
const environment_1 = require("../config/environment");
// Request schemas
exports.restIncomingSchema = zod_1.z.object({
    caller_number: zod_1.z.string().min(1),
    device_id: zod_1.z.string().min(1),
    timestamp: zod_1.z.number().int().positive().optional(),
});
exports.restOutgoingSchema = zod_1.z.object({
    phone_number: zod_1.z.string().min(1),
    device_id: zod_1.z.string().min(1),
});
exports.restEndedSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
    duration_seconds: zod_1.z.number().int().nonnegative(),
});
exports.restTestSignalSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
});
function deviceOf(req) {
    return req.device;
}
async function handleIncomingCallRest(req, res, next) {
    try {
        const device = deviceOf(req);
        const body = exports.restIncomingSchema.parse(req.body);
        winstonLogger_1.winstonLogger.info(`REST API: handleIncomingCall device=${device.externalId} caller=${body.caller_number}`);
        if (device.externalId === "iphone") {
            throw new errorHandler_1.HttpError(403, "iPhones are not authorized to signal incoming SIM calls");
        }
        if (body.device_id !== device.externalId) {
            throw new errorHandler_1.HttpError(400, "device_id in request body does not match authorized device");
        }
        const callId = (0, crypto_1.randomUUID)();
        await webrtcSignal_1.WebRTCSignalServer.handleIncomingCall(body.caller_number, callId);
        res.status(201).json({
            call_id: callId,
            status: "created",
        });
    }
    catch (err) {
        next(err);
    }
}
async function handleOutgoingCallRest(req, res, next) {
    try {
        const device = deviceOf(req);
        const body = exports.restOutgoingSchema.parse(req.body);
        winstonLogger_1.winstonLogger.info(`REST API: handleOutgoingCall initiator=${device.externalId} target_device=${body.device_id} phone=${body.phone_number}`);
        const targetDevice = await database_1.prisma.device.findUnique({
            where: { externalId: body.device_id },
        });
        if (!targetDevice) {
            throw new errorHandler_1.HttpError(404, `Target device ${body.device_id} not found in database`);
        }
        const callId = (0, crypto_1.randomUUID)();
        await webrtcSignal_1.WebRTCSignalServer.handleOutgoingCall(body.phone_number, callId);
        res.status(201).json({
            call_id: callId,
            status: "dialing",
        });
    }
    catch (err) {
        next(err);
    }
}
async function handleEndedCallRest(req, res, next) {
    try {
        const body = exports.restEndedSchema.parse(req.body);
        winstonLogger_1.winstonLogger.info(`REST API: handleEndedCall call_id=${body.call_id} duration_seconds=${body.duration_seconds}`);
        await webrtcSignal_1.WebRTCSignalServer.handleCallEnd(body.call_id, body.duration_seconds);
        res.status(200).json({
            status: "recorded",
        });
    }
    catch (err) {
        next(err);
    }
}
async function handleHealthRest(_req, res, next) {
    try {
        res.status(200).json({
            status: "ok",
            webrtc_signal_server: "ready",
        });
    }
    catch (err) {
        next(err);
    }
}
async function handleStatsRest(_req, res, next) {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const activeCallsCount = webrtcSignal_1.WebRTCSignalServer.getActiveCallsCount();
        const callsToday = await database_1.prisma.call.findMany({
            where: {
                created_at: {
                    gte: startOfToday,
                },
            },
            select: {
                duration_seconds: true,
            },
        });
        const totalToday = callsToday.length;
        const totalDuration = callsToday.reduce((sum, c) => sum + c.duration_seconds, 0);
        const avgDuration = totalToday > 0 ? Math.round(totalDuration / totalToday) : 0;
        res.status(200).json({
            active_calls: activeCallsCount,
            total_today: totalToday,
            avg_duration: avgDuration,
        });
    }
    catch (err) {
        next(err);
    }
}
async function handleTestSignalRest(req, res, next) {
    try {
        const body = exports.restTestSignalSchema.parse(req.body);
        winstonLogger_1.winstonLogger.info(`REST API: handleTestSignal call_id=${body.call_id}`);
        const io = (0, socketService_1.getIo)();
        const timestamp = Date.now();
        io.to(`call_${body.call_id}`).emit("webrtc:test-signal", {
            data: (0, crypto_2.encryptPayload)({
                call_id: body.call_id,
                timestamp,
                message: "Test signal from server",
            }, environment_1.env.registerSecret)
        });
        res.status(200).json({
            message_received: true,
            timestamp,
        });
    }
    catch (err) {
        next(err);
    }
}
async function handleHistoryRest(req, res, next) {
    try {
        const calls = await database_1.prisma.call.findMany({
            where: {
                state: { in: ['CONNECTED', 'ENDED', 'FAILED'] }
            },
            orderBy: { started_at: "desc" },
            take: 100,
        });
        const mappedCalls = calls.map(c => ({
            // Swift/iOS default Decodable keys
            callId: c.id,
            number: c.receiver_number || c.initiator_number || "unknown",
            name: c.initiator_number || null,
            isIncoming: !c.is_incoming,
            // Snake_case keys for other consumers/tests
            id: c.id,
            caller_number: c.initiator_number || c.receiver_number || "unknown",
            caller_name: c.initiator_number || c.receiver_number || "unknown",
            duration: c.duration_seconds,
            timestamp: c.started_at,
            is_incoming: !c.is_incoming,
            call_type: c.is_incoming ? 'incoming' : 'outgoing'
        }));
        console.log(`[API] Fetched history: ${mappedCalls.length} calls`);
        res.status(200).json(mappedCalls);
    }
    catch (err) {
        console.error('History fetch error:', err);
        next(err);
    }
}
//# sourceMappingURL=webrtcCallsController.js.map