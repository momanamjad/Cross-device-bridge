"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebRTCSignalServer = void 0;
const database_1 = require("../config/database");
const winstonLogger_1 = require("../lib/winstonLogger");
const crypto_1 = require("../lib/crypto");
const environment_1 = require("../config/environment");
class WebRTCSignalServer {
    static io = null;
    static activeCalls = new Map();
    static cleanupInterval = null;
    static initialize(io) {
        this.io = io;
        winstonLogger_1.winstonLogger.info("WebRTCSignalServer initialized with Socket.io server");
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        // Run cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupStaleCalls().catch((err) => {
                winstonLogger_1.winstonLogger.error("Error during stale call cleanup: %O", err);
            });
        }, 5 * 60 * 1000);
    }
    static getIo() {
        if (!this.io) {
            throw new Error("Socket.io Server not initialized on WebRTCSignalServer");
        }
        return this.io;
    }
    static getActiveCallsCount() {
        return this.activeCalls.size;
    }
    static async handleIncomingCall(callerNumber, callId) {
        winstonLogger_1.winstonLogger.info(`WebRTCSignalServer: handleIncomingCall callerNumber=${callerNumber} callId=${callId}`);
        const existing = this.activeCalls.get(callId);
        if (existing) {
            winstonLogger_1.winstonLogger.warn(`Call already exists in-memory: ${callId}`);
            return existing;
        }
        const call = await database_1.prisma.call.create({
            data: {
                id: callId,
                initiator_device: "realme_c3_1",
                receiver_number: callerNumber,
                state: "RINGING",
                is_incoming: true,
                started_at: new Date(),
            },
        });
        console.log(`[CREATE] Incoming call: ${callId}`);
        const activeCall = {
            id: call.id,
            initiator_device: "realme_c3_1",
            receiver_number: callerNumber,
            state: "RINGING_INCOMING",
            is_incoming: true,
            started_at: call.started_at,
        };
        this.activeCalls.set(callId, activeCall);
        // Make sure both devices join room call_${callId} if currently connected
        await this.joinDevicesToCallRoom(callId);
        // Broadcast call:incoming to iPhone
        this.broadcastToDevice("iphone", "call:incoming", {
            call_id: callId,
            caller_number: callerNumber,
            timestamp: Date.now(),
        });
        return activeCall;
    }
    static async handleOutgoingCall(phoneNumber, callId) {
        winstonLogger_1.winstonLogger.info(`WebRTCSignalServer: handleOutgoingCall phoneNumber=${phoneNumber} callId=${callId}`);
        const existing = this.activeCalls.get(callId);
        if (existing) {
            winstonLogger_1.winstonLogger.warn(`Call already exists in-memory: ${callId}`);
            return existing;
        }
        const call = await database_1.prisma.call.create({
            data: {
                id: callId,
                initiator_device: "iphone",
                receiver_number: phoneNumber,
                state: "RINGING",
                is_incoming: false,
                started_at: new Date(),
            },
        });
        console.log(`[CREATE] Outgoing call: ${callId}`);
        const activeCall = {
            id: call.id,
            initiator_device: "iphone",
            receiver_number: phoneNumber,
            state: "RINGING_OUTGOING",
            is_incoming: false,
            started_at: call.started_at,
        };
        this.activeCalls.set(callId, activeCall);
        // Make sure both devices join room call_${callId} if currently connected
        await this.joinDevicesToCallRoom(callId);
        // Relay to Realme to start dialing
        this.broadcastToDevice("realme_c3_1", "call:outgoing", {
            call_id: callId,
            phone_number: phoneNumber,
        });
        // Notify iPhone that dial is initiated
        this.broadcastToDevice("iphone", "call:outgoing-initiated", {
            call_id: callId,
            phone_number: phoneNumber,
            status: "dialing",
        });
        return activeCall;
    }
    static async handleAcceptCall(callId, fromDevice) {
        winstonLogger_1.winstonLogger.info(`WebRTCSignalServer: handleAcceptCall callId=${callId} fromDevice=${fromDevice}`);
        const call = this.activeCalls.get(callId);
        if (!call) {
            throw new Error(`Call not found in memory: ${callId}`);
        }
        call.state = "ACCEPTING";
        await database_1.prisma.call.update({
            where: { id: callId },
            data: { state: "CONNECTING" },
        });
        console.log(`[STATE] Call ${callId}: CONNECTING`);
        // Relay call:accept-ack to Realme
        this.broadcastToDevice("realme_c3_1", "call:accept-ack", { call_id: callId });
        return call;
    }
    static async handleRejectCall(callId, fromDevice) {
        winstonLogger_1.winstonLogger.info(`WebRTCSignalServer: handleRejectCall callId=${callId} fromDevice=${fromDevice}`);
        await database_1.prisma.call.update({
            where: { id: callId },
            data: {
                state: "ENDED",
                ended_at: new Date(),
                duration_seconds: 0,
                connected_successfully: false,
            },
        });
        this.activeCalls.delete(callId);
        // Relay call:reject-ack to Realme
        this.broadcastToDevice("realme_c3_1", "call:reject-ack", { call_id: callId });
        // Notify iPhone
        this.broadcastToDevice("iphone", "call:hangup", { call_id: callId, duration: 0 });
    }
    static async relaySDPOffer(callId, sdp) {
        winstonLogger_1.winstonLogger.info(`WebRTCSignalServer: relaySDPOffer callId=${callId}`);
        const call = this.activeCalls.get(callId);
        if (call) {
            call.state = "CONNECTING";
        }
        this.broadcastToDevice("iphone", "webrtc:offer", {
            call_id: callId,
            sdp_offer: sdp,
        });
    }
    static async relaySDPAnswer(callId, sdp) {
        winstonLogger_1.winstonLogger.info(`WebRTCSignalServer: relaySDPAnswer callId=${callId}`);
        const call = this.activeCalls.get(callId);
        if (call) {
            call.state = "CONNECTED";
            call.connected_at = new Date();
        }
        await database_1.prisma.call.update({
            where: { id: callId },
            data: {
                state: "CONNECTED",
                connected_successfully: true,
            },
        });
        // Relay to Realme
        this.broadcastToDevice("realme_c3_1", "webrtc:answer", {
            call_id: callId,
            sdp_answer: sdp,
        });
        // Notify iPhone
        this.broadcastToDevice("iphone", "call:connected", {
            call_id: callId,
            duration: 0,
        });
    }
    static async relayICECandidate(callId, candidate, fromDevice) {
        winstonLogger_1.winstonLogger.debug(`WebRTCSignalServer: relayICECandidate callId=${callId} fromDevice=${fromDevice}`);
        const candidateStr = typeof candidate === "string" ? candidate : JSON.stringify(candidate);
        await database_1.prisma.iceCandidate.create({
            data: {
                call_id: callId,
                candidate: candidateStr,
                sdp_mid: candidate.sdpMid || candidate.sdp_mid || null,
                sdp_mline_index: candidate.sdpMLineIndex !== undefined
                    ? Number(candidate.sdpMLineIndex)
                    : candidate.sdp_mline_index !== undefined
                        ? Number(candidate.sdp_mline_index)
                        : null,
                from_device: fromDevice === "realme_c3_1" ? "realme" : fromDevice,
            },
        });
        const targetDevice = (fromDevice === "iphone") ? "realme_c3_1" : "iphone";
        this.broadcastToDevice(targetDevice, "webrtc:ice-candidate", {
            call_id: callId,
            candidate,
        });
    }
    static async handleWebRtcConnected(callId) {
        winstonLogger_1.winstonLogger.info(`WebRTCSignalServer: handleWebRtcConnected callId=${callId}`);
        const call = this.activeCalls.get(callId);
        if (call) {
            call.state = "CONNECTED";
            call.connected_at = new Date();
        }
        await database_1.prisma.call.update({
            where: { id: callId },
            data: {
                state: "CONNECTED",
                connected_successfully: true,
            },
        });
        console.log(`[STATE] Call ${callId}: CONNECTED - Audio flowing`);
    }
    static async handleCallEnd(callId, duration) {
        winstonLogger_1.winstonLogger.info(`WebRTCSignalServer: handleCallEnd callId=${callId} duration=${duration}`);
        const call = this.activeCalls.get(callId);
        let calculatedDuration = duration || 0;
        if (!calculatedDuration && call) {
            if (call.connected_at) {
                calculatedDuration = Math.round((Date.now() - call.connected_at.getTime()) / 1000);
            }
            else {
                calculatedDuration = Math.round((Date.now() - call.started_at.getTime()) / 1000);
            }
        }
        console.log(`[HANGUP] Call ${callId} ended by device`);
        console.log(`[HANGUP] Duration: ${calculatedDuration} seconds`);
        await database_1.prisma.call.update({
            where: { id: callId },
            data: {
                state: "ENDED",
                ended_at: new Date(),
                duration_seconds: calculatedDuration,
                connected_successfully: calculatedDuration > 5,
            },
        });
        console.log(`[DB] Call recorded: ${callId}`);
        this.activeCalls.delete(callId);
        const io = this.getIo();
        // Emit call:ended event to all connected clients in the room
        io.to(`call_${callId}`).emit("call:ended", {
            data: (0, crypto_1.encryptPayload)({
                event: "call:ended",
                call_id: callId,
                duration: calculatedDuration,
                timestamp: new Date().toISOString(),
            }, environment_1.env.registerSecret)
        });
        console.log(`[SOCKET] Emitted call:ended to all clients`);
        // Also broadcast to update call history
        io.emit("call:history-updated", {
            data: (0, crypto_1.encryptPayload)({
                event: "call:history-updated",
                call_id: callId,
                duration: calculatedDuration,
            }, environment_1.env.registerSecret)
        });
        console.log(`[SOCKET] Emitted call:history-updated`);
        // Keep existing events for backward compatibility
        io.to(`call_${callId}`).emit("call:hangup", {
            call_id: callId,
            duration: calculatedDuration,
            data: (0, crypto_1.encryptPayload)({
                call_id: callId,
                duration: calculatedDuration,
            }, environment_1.env.registerSecret)
        });
        this.broadcastToDevice("realme_c3_1", "call:hangup", {
            call_id: callId,
            duration: calculatedDuration,
        });
        this.broadcastToDevice("iphone", "call:hangup", {
            call_id: callId,
            duration: calculatedDuration,
        });
    }
    static async getCallState(callId) {
        const active = this.activeCalls.get(callId);
        if (active)
            return active;
        const call = await database_1.prisma.call.findUnique({
            where: { id: callId },
        });
        return call;
    }
    static async broadcastToDevice(device, event, data) {
        let targetDevice = device;
        const io = this.getIo();
        if (device === "realme" || device === "realme_c3_1") {
            const sockets = await io.fetchSockets();
            const androidSocket = sockets.find((s) => s.data.externalId && s.data.externalId !== "iphone");
            if (androidSocket) {
                targetDevice = androidSocket.data.externalId;
                androidSocket.emit(event, data);
            }
            else {
                targetDevice = "realme_c3_1"; // fallback
                io.to(`device_ext:${targetDevice}`).emit(event, data);
            }
        }
        else {
            targetDevice = "iphone";
            const encrypted = (0, crypto_1.encryptPayload)(data, environment_1.env.registerSecret);
            io.to(`device_ext:${targetDevice}`).emit(event, { data: encrypted, ...data });
        }
        winstonLogger_1.winstonLogger.debug(`WebRTCSignalServer: broadcastToDevice target=${targetDevice} event=${event}`);
    }
    static async joinDevicesToCallRoom(callId) {
        try {
            const io = this.getIo();
            const sockets = await io.fetchSockets();
            let joinedCount = 0;
            for (const socket of sockets) {
                void socket.join(`call_${callId}`);
                joinedCount++;
            }
            winstonLogger_1.winstonLogger.info(`WebRTCSignalServer: joined ${joinedCount} sockets to room call_${callId}`);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error("WebRTCSignalServer: Failed to join sockets to call room: %O", err);
        }
    }
    static async cleanupStaleCalls() {
        winstonLogger_1.winstonLogger.info("WebRTCSignalServer: Running periodic cleanup for stale calls...");
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        for (const [id, call] of this.activeCalls.entries()) {
            if (call.started_at < cutoff) {
                winstonLogger_1.winstonLogger.warn(`WebRTCSignalServer: Cleaning up stale in-memory call ${id}`);
                this.activeCalls.delete(id);
            }
        }
        try {
            const updated = await database_1.prisma.call.updateMany({
                where: {
                    state: { in: ["RINGING", "CONNECTING", "CONNECTED"] },
                    started_at: { lt: cutoff },
                },
                data: {
                    state: "FAILED",
                    ended_at: new Date(),
                },
            });
            if (updated.count > 0) {
                winstonLogger_1.winstonLogger.warn(`WebRTCSignalServer: Updated ${updated.count} stale DB calls to FAILED status`);
            }
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error("WebRTCSignalServer: Error updating stale calls in DB: %O", err);
        }
    }
}
exports.WebRTCSignalServer = WebRTCSignalServer;
