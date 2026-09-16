"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
exports.getIo = getIo;
exports.emitToDevice = emitToDevice;
exports.broadcastToAll = broadcastToAll;
exports.emitToDeviceRaw = emitToDeviceRaw;
const socket_io_1 = require("socket.io");
const environment_1 = require("../config/environment");
const database_1 = require("../config/database");
const crypto_1 = require("../lib/crypto");
const logger_1 = require("../lib/logger");
const callHandlers_1 = require("../sockets/callHandlers");
const webrtcSignal_1 = require("./webrtcSignal");
let io = null;
function initSocket(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: environment_1.env.nodeEnv === "development" ? true : environment_1.env.corsOrigin.split(",").map((s) => s.trim()),
            methods: ["GET", "POST"],
        },
    });
    // Initialize WebRTC signaling service
    webrtcSignal_1.WebRTCSignalServer.initialize(io);
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token ??
                socket.handshake.query?.token;
            if (!token) {
                next(new Error("unauthorized"));
                return;
            }
            const device = await database_1.prisma.device.findFirst({
                where: { tokenHash: (0, crypto_1.hashToken)(token), isActive: true },
            });
            if (!device) {
                next(new Error("unauthorized"));
                return;
            }
            socket.data.deviceId = device.id;
            socket.data.externalId = device.externalId;
            next();
        }
        catch (err) {
            next(err);
        }
    });
    io.on("connection", (socket) => {
        const deviceId = socket.data.deviceId;
        const externalId = socket.data.externalId;
        const room = `device:${deviceId}`;
        const extRoom = `device_ext:${externalId}`;
        void socket.join(room);
        void socket.join(extRoom);
        socket.use((packet, next) => {
            // packet: [eventName, arg1, arg2, ...]
            if (packet.length > 1 && packet[1] && typeof packet[1] === "object" && typeof packet[1].data === "string") {
                try {
                    packet[1] = (0, crypto_1.decryptPayload)(packet[1].data, environment_1.env.registerSecret);
                }
                catch (err) {
                    logger_1.logger.error({ err }, "Failed to decrypt incoming socket payload");
                    return next(new Error("Decryption failed"));
                }
            }
            next();
        });
        logger_1.logger.info({ deviceId, externalId, sid: socket.id }, "socket connected");
        const statusPayload = {
            device_id: externalId,
            status: "online",
            last_seen: new Date().toISOString(),
        };
        socket.emit("device:status", { data: (0, crypto_1.encryptPayload)(statusPayload, environment_1.env.registerSecret) });
        socket.on("message:confirm", async (payload) => {
            if (!payload?.id)
                return;
            await database_1.prisma.message.updateMany({
                where: { id: payload.id, deviceId },
                data: { synced: true, syncedAt: new Date() },
            });
        });
        socket.on("call:confirm", async (payload) => {
            if (!payload?.id)
                return;
            await database_1.prisma.callNotification.updateMany({
                where: { id: payload.id, deviceId },
                data: { synced: true, syncedAt: new Date() },
            });
        });
        // Register WebRTC Call handlers
        (0, callHandlers_1.registerCallHandlers)(io, socket);
        socket.on("disconnect", () => {
            logger_1.logger.info({ deviceId, externalId, sid: socket.id }, "socket disconnected");
        });
    });
    return io;
}
function getIo() {
    if (!io) {
        throw new Error("Socket.io not initialized");
    }
    return io;
}
function emitToDevice(deviceId, event, payload) {
    if (!io)
        return;
    const encrypted = (0, crypto_1.encryptPayload)(payload, environment_1.env.registerSecret);
    io.to(`device:${deviceId}`).emit(event, { data: encrypted });
    io.to("device_ext:iphone").emit(event, { data: encrypted });
}
function broadcastToAll(event, payload) {
    if (!io)
        return;
    const encrypted = (0, crypto_1.encryptPayload)(payload, environment_1.env.registerSecret);
    io.emit(event, { data: encrypted });
}
function emitToDeviceRaw(deviceId, event, payload) {
    if (!io)
        return;
    io.to(`device:${deviceId}`).emit(event, payload);
}
