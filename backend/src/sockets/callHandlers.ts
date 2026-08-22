import { Server, Socket } from "socket.io";
import { z } from "zod";
import { WebRTCSignalServer } from "../services/webrtcSignal";
import { winstonLogger as logger } from "../lib/winstonLogger";

// Payload Schemas
const callIncomingSchema = z.object({
  call_id: z.string().min(1),
  caller_number: z.string().min(1),
  timestamp: z.number().optional(),
});

const callIncomingAckSchema = z.object({
  call_id: z.string().min(1),
});

const callAcceptSchema = z.object({
  call_id: z.string().min(1),
});

const callRejectSchema = z.object({
  call_id: z.string().min(1),
});

const callOutgoingSchema = z.object({
  call_id: z.string().min(1),
  phone_number: z.string().min(1),
});

const callHangupSchema = z.object({
  call_id: z.string().min(1),
  duration: z.number().optional(),
});

const webrtcOfferSchema = z.object({
  call_id: z.string().min(1),
  sdp_offer: z.string().min(1),
  ice_candidates: z.array(z.any()).optional(),
});

const webrtcAnswerSchema = z.object({
  call_id: z.string().min(1),
  sdp_answer: z.string().min(1),
});

const webrtcIceCandidateSchema = z.object({
  call_id: z.string().min(1),
  candidate: z.any(),
});

export function registerCallHandlers(io: Server, socket: Socket) {
  const fromDevice = socket.data.externalId as string;

  socket.on("call:incoming", async (payload: unknown) => {
    try {
      logger.info(`Socket event "call:incoming" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
      if (fromDevice !== "realme_c3_1") {
        socket.emit("call:error", { call_id: "", error_message: "Only realme_c3_1 can signal incoming SIM calls" });
        return;
      }
      const data = callIncomingSchema.parse(payload);
      await socket.join(`call_${data.call_id}`);
      await WebRTCSignalServer.handleIncomingCall(data.caller_number, data.call_id);
    } catch (err: any) {
      logger.error(`Error in call:incoming handler: ${err.message || err}`, { err });
      socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
    }
  });

  socket.on("call:incoming-ack", async (payload: unknown) => {
    try {
      logger.info(`Socket event "call:incoming-ack" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
      const data = callIncomingAckSchema.parse(payload);
      await socket.join(`call_${data.call_id}`);
      logger.info(`iPhone acknowledged incoming call: ${data.call_id}`);
    } catch (err: any) {
      logger.error(`Error in call:incoming-ack handler: ${err.message || err}`, { err });
      socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
    }
  });

  socket.on("call:accept", async (payload: unknown) => {
    try {
      logger.info(`Socket event "call:accept" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
      const data = callAcceptSchema.parse(payload);
      await socket.join(`call_${data.call_id}`);
      await WebRTCSignalServer.handleAcceptCall(data.call_id, fromDevice);
    } catch (err: any) {
      logger.error(`Error in call:accept handler: ${err.message || err}`, { err });
      socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
    }
  });

  const handleReject = async (payload: unknown) => {
    try {
      logger.info(`Socket event "call:reject/rejected" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
      const data = callRejectSchema.parse(payload);
      await socket.join(`call_${data.call_id}`);
      await WebRTCSignalServer.handleRejectCall(data.call_id, fromDevice);
    } catch (err: any) {
      logger.error(`Error in call:reject/rejected handler: ${err.message || err}`, { err });
      socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
    }
  };

  socket.on("call:reject", handleReject);
  socket.on("call:rejected", handleReject);

  socket.on("call:outgoing", async (payload: unknown) => {
    try {
      logger.info(`Socket event "call:outgoing" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
      const data = callOutgoingSchema.parse(payload);
      await socket.join(`call_${data.call_id}`);
      await WebRTCSignalServer.handleOutgoingCall(data.phone_number, data.call_id);
    } catch (err: any) {
      logger.error(`Error in call:outgoing handler: ${err.message || err}`, { err });
      socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
    }
  });

  socket.on("call:hangup", async (payload: unknown) => {
    try {
      logger.info(`Socket event "call:hangup" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
      const data = callHangupSchema.parse(payload);
      await socket.join(`call_${data.call_id}`);
      await WebRTCSignalServer.handleCallEnd(data.call_id, data.duration);
    } catch (err: any) {
      logger.error(`Error in call:hangup handler: ${err.message || err}`, { err });
      socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
    }
  });

  socket.on("webrtc:offer", async (payload: unknown) => {
    try {
      logger.info(`Socket event "webrtc:offer" from device=${fromDevice}`);
      const data = webrtcOfferSchema.parse(payload);
      await socket.join(`call_${data.call_id}`);
      await WebRTCSignalServer.relaySDPOffer(data.call_id, data.sdp_offer);

      if (data.ice_candidates && Array.isArray(data.ice_candidates)) {
        for (const candidate of data.ice_candidates) {
          await WebRTCSignalServer.relayICECandidate(data.call_id, candidate, fromDevice);
        }
      }
    } catch (err: any) {
      logger.error(`Error in webrtc:offer handler: ${err.message || err}`, { err });
      socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
    }
  });

  socket.on("webrtc:answer", async (payload: unknown) => {
    try {
      logger.info(`Socket event "webrtc:answer" from device=${fromDevice}`);
      const data = webrtcAnswerSchema.parse(payload);
      await socket.join(`call_${data.call_id}`);
      await WebRTCSignalServer.relaySDPAnswer(data.call_id, data.sdp_answer);
    } catch (err: any) {
      logger.error(`Error in webrtc:answer handler: ${err.message || err}`, { err });
      socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
    }
  });

  socket.on("webrtc:ice-candidate", async (payload: unknown) => {
    try {
      logger.debug(`Socket event "webrtc:ice-candidate" from device=${fromDevice}`);
      const data = webrtcIceCandidateSchema.parse(payload);
      await socket.join(`call_${data.call_id}`);
      await WebRTCSignalServer.relayICECandidate(data.call_id, data.candidate, fromDevice);
    } catch (err: any) {
      logger.error(`Error in webrtc:ice-candidate handler: ${err.message || err}`, { err });
      socket.emit("call:error", { call_id: "", error_message: err.message || "Invalid payload" });
    }
  });

  socket.on("webrtc:connected", async (payload: unknown) => {
    try {
      logger.info(`Socket event "webrtc:connected" from device=${fromDevice} payload=${JSON.stringify(payload)}`);
      const data = z.object({ call_id: z.string().min(1) }).parse(payload);
      await WebRTCSignalServer.handleWebRtcConnected(data.call_id);
    } catch (err: any) {
      logger.error(`Error in webrtc:connected handler: ${err.message || err}`, { err });
    }
  });
}
