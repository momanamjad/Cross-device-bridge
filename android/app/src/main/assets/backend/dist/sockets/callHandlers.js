"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCallHandlers = registerCallHandlers;
const zod_1 = require("zod");
const webrtcSignal_1 = require("../services/webrtcSignal");
const winstonLogger_1 = require("../lib/winstonLogger");
// Payload Schemas
const callIncomingSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
    caller_number: zod_1.z.string().min(1),
    timestamp: zod_1.z.number().optional(),
});
const callIncomingAckSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
});
const callAcceptSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
});
const callRejectSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
});
const callOutgoingSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
    phone_number: zod_1.z.string().min(1),
});
const callHangupSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
    duration: zod_1.z.number().optional(),
});
const webrtcOfferSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
    sdp_offer: zod_1.z.string().min(1),
    ice_candidates: zod_1.z.array(zod_1.z.any()).optional(),
});
const webrtcAnswerSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
    sdp_answer: zod_1.z.string().min(1),
});
const webrtcIceCandidateSchema = zod_1.z.object({
    call_id: zod_1.z.string().min(1),
    candidate: zod_1.z.any(),
});
function registerCallHandlers(io, socket) {
    const fromDevice = socket.data.externalId;
    socket.on("call:incoming", async (payload) => {
        try {
            winstonLogger_1.winstonLogger.info(`Socket event "call:incoming" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
            if (fromDevice === "iphone") {
                socket.emit("call:error", { call_id: "", error_message: "iPhones cannot signal incoming SIM calls" });
                return;
            }
            const data = callIncomingSchema.parse(payload);
            await socket.join(`call_${data.call_id}`);
            await webrtcSignal_1.WebRTCSignalServer.handleIncomingCall(data.caller_number, data.call_id);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`Error in call:incoming handler: ${err.message || err}`, { err });
            socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
        }
    });
    socket.on("call:incoming-ack", async (payload) => {
        try {
            winstonLogger_1.winstonLogger.info(`Socket event "call:incoming-ack" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
            const data = callIncomingAckSchema.parse(payload);
            await socket.join(`call_${data.call_id}`);
            winstonLogger_1.winstonLogger.info(`iPhone acknowledged incoming call: ${data.call_id}`);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`Error in call:incoming-ack handler: ${err.message || err}`, { err });
            socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
        }
    });
    socket.on("call:accept", async (payload) => {
        try {
            winstonLogger_1.winstonLogger.info(`Socket event "call:accept" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
            const data = callAcceptSchema.parse(payload);
            await socket.join(`call_${data.call_id}`);
            await webrtcSignal_1.WebRTCSignalServer.handleAcceptCall(data.call_id, fromDevice);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`Error in call:accept handler: ${err.message || err}`, { err });
            socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
        }
    });
    const handleReject = async (payload) => {
        try {
            winstonLogger_1.winstonLogger.info(`Socket event "call:reject/rejected" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
            const data = callRejectSchema.parse(payload);
            await socket.join(`call_${data.call_id}`);
            await webrtcSignal_1.WebRTCSignalServer.handleRejectCall(data.call_id, fromDevice);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`Error in call:reject/rejected handler: ${err.message || err}`, { err });
            socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
        }
    };
    socket.on("call:reject", handleReject);
    socket.on("call:rejected", handleReject);
    socket.on("call:outgoing", async (payload) => {
        try {
            winstonLogger_1.winstonLogger.info(`Socket event "call:outgoing" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
            const data = callOutgoingSchema.parse(payload);
            await socket.join(`call_${data.call_id}`);
            await webrtcSignal_1.WebRTCSignalServer.handleOutgoingCall(data.phone_number, data.call_id);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`Error in call:outgoing handler: ${err.message || err}`, { err });
            socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
        }
    });
    socket.on("call:hangup", async (payload) => {
        try {
            winstonLogger_1.winstonLogger.info(`Socket event "call:hangup" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
            const data = callHangupSchema.parse(payload);
            await socket.join(`call_${data.call_id}`);
            await webrtcSignal_1.WebRTCSignalServer.handleCallEnd(data.call_id, data.duration);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`Error in call:hangup handler: ${err.message || err}`, { err });
            socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
        }
    });
    socket.on("webrtc:offer", async (payload) => {
        try {
            winstonLogger_1.winstonLogger.info(`Socket event "webrtc:offer" from device=${fromDevice}`);
            const data = webrtcOfferSchema.parse(payload);
            await socket.join(`call_${data.call_id}`);
            await webrtcSignal_1.WebRTCSignalServer.relaySDPOffer(data.call_id, data.sdp_offer);
            if (data.ice_candidates && Array.isArray(data.ice_candidates)) {
                for (const candidate of data.ice_candidates) {
                    await webrtcSignal_1.WebRTCSignalServer.relayICECandidate(data.call_id, candidate, fromDevice);
                }
            }
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`Error in webrtc:offer handler: ${err.message || err}`, { err });
            socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
        }
    });
    socket.on("webrtc:answer", async (payload) => {
        try {
            winstonLogger_1.winstonLogger.info(`Socket event "webrtc:answer" from device=${fromDevice}`);
            const data = webrtcAnswerSchema.parse(payload);
            await socket.join(`call_${data.call_id}`);
            await webrtcSignal_1.WebRTCSignalServer.relaySDPAnswer(data.call_id, data.sdp_answer);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`Error in webrtc:answer handler: ${err.message || err}`, { err });
            socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
        }
    });
    socket.on("webrtc:ice-candidate", async (payload) => {
        try {
            winstonLogger_1.winstonLogger.debug(`Socket event "webrtc:ice-candidate" from device=${fromDevice}`);
            const data = webrtcIceCandidateSchema.parse(payload);
            await socket.join(`call_${data.call_id}`);
            await webrtcSignal_1.WebRTCSignalServer.relayICECandidate(data.call_id, data.candidate, fromDevice);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`Error in webrtc:ice-candidate handler: ${err.message || err}`, { err });
            socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
        }
    });
    socket.on("webrtc:connected", async (payload) => {
        try {
            winstonLogger_1.winstonLogger.info(`Socket event "webrtc:connected" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
            const data = zod_1.z.object({ call_id: zod_1.z.string().min(1) }).parse(payload);
            await webrtcSignal_1.WebRTCSignalServer.handleWebRtcConnected(data.call_id);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`Error in webrtc:connected handler: ${err.message || err}`, { err });
        }
    });
}
//# sourceMappingURL=callHandlers.js.map