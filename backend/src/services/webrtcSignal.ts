import { Server } from "socket.io";
import { prisma } from "../config/database";
import { winstonLogger as logger } from "../lib/winstonLogger";

export interface ActiveCall {
  id: string;
  initiator_device: string; // "realme_c3_1" or "iphone"
  initiator_number?: string | null;
  receiver_number?: string | null;
  state: string; // IDLE, RINGING_INCOMING, ACCEPTING, CONNECTING, CONNECTED, RINGING_OUTGOING, DISCONNECTING, ENDED, FAILED
  is_incoming: boolean;
  started_at: Date;
  connected_at?: Date | null;
  call_sid?: string | null;
}

export class WebRTCSignalServer {
  private static io: Server | null = null;
  private static activeCalls = new Map<string, ActiveCall>();
  private static cleanupInterval: NodeJS.Timeout | null = null;

  public static initialize(io: Server) {
    this.io = io;
    logger.info("WebRTCSignalServer initialized with Socket.io server");

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleCalls().catch((err) => {
        logger.error("Error during stale call cleanup: %O", err);
      });
    }, 5 * 60 * 1000);
  }

  private static getIo(): Server {
    if (!this.io) {
      throw new Error("Socket.io Server not initialized on WebRTCSignalServer");
    }
    return this.io;
  }

  public static getActiveCallsCount(): number {
    return this.activeCalls.size;
  }

  public static async handleIncomingCall(callerNumber: string, callId: string): Promise<ActiveCall> {
    logger.info(`WebRTCSignalServer: handleIncomingCall callerNumber=${callerNumber} callId=${callId}`);

    const existing = this.activeCalls.get(callId);
    if (existing) {
      logger.warn(`Call already exists in-memory: ${callId}`);
      return existing;
    }

    const call = await prisma.call.create({
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

    const activeCall: ActiveCall = {
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

  public static async handleOutgoingCall(phoneNumber: string, callId: string): Promise<ActiveCall> {
    logger.info(`WebRTCSignalServer: handleOutgoingCall phoneNumber=${phoneNumber} callId=${callId}`);

    const existing = this.activeCalls.get(callId);
    if (existing) {
      logger.warn(`Call already exists in-memory: ${callId}`);
      return existing;
    }

    const call = await prisma.call.create({
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

    const activeCall: ActiveCall = {
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

  public static async handleAcceptCall(callId: string, fromDevice: string): Promise<ActiveCall> {
    logger.info(`WebRTCSignalServer: handleAcceptCall callId=${callId} fromDevice=${fromDevice}`);
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw new Error(`Call not found in memory: ${callId}`);
    }

    call.state = "ACCEPTING";
    await prisma.call.update({
      where: { id: callId },
      data: { state: "CONNECTING" },
    });

    console.log(`[STATE] Call ${callId}: CONNECTING`);

    // Relay call:accept-ack to Realme
    this.broadcastToDevice("realme_c3_1", "call:accept-ack", { call_id: callId });

    return call;
  }

  public static async handleRejectCall(callId: string, fromDevice: string): Promise<void> {
    logger.info(`WebRTCSignalServer: handleRejectCall callId=${callId} fromDevice=${fromDevice}`);
    
    await prisma.call.update({
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

  public static async relaySDPOffer(callId: string, sdp: string): Promise<void> {
    logger.info(`WebRTCSignalServer: relaySDPOffer callId=${callId}`);
    const call = this.activeCalls.get(callId);
    if (call) {
      call.state = "CONNECTING";
    }

    this.broadcastToDevice("iphone", "webrtc:offer", {
      call_id: callId,
      sdp_offer: sdp,
    });
  }

  public static async relaySDPAnswer(callId: string, sdp: string): Promise<void> {
    logger.info(`WebRTCSignalServer: relaySDPAnswer callId=${callId}`);
    const call = this.activeCalls.get(callId);
    if (call) {
      call.state = "CONNECTED";
      call.connected_at = new Date();
    }

    await prisma.call.update({
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

  public static async relayICECandidate(callId: string, candidate: any, fromDevice: string): Promise<void> {
    logger.debug(`WebRTCSignalServer: relayICECandidate callId=${callId} fromDevice=${fromDevice}`);

    const candidateStr = typeof candidate === "string" ? candidate : JSON.stringify(candidate);

    await prisma.iceCandidate.create({
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

  public static async handleWebRtcConnected(callId: string): Promise<void> {
    logger.info(`WebRTCSignalServer: handleWebRtcConnected callId=${callId}`);
    const call = this.activeCalls.get(callId);
    if (call) {
      call.state = "CONNECTED";
      call.connected_at = new Date();
    }

    await prisma.call.update({
      where: { id: callId },
      data: {
        state: "CONNECTED",
        connected_successfully: true,
      },
    });
    console.log(`[STATE] Call ${callId}: CONNECTED - Audio flowing`);
  }

  public static async handleCallEnd(callId: string, duration?: number): Promise<void> {
    logger.info(`WebRTCSignalServer: handleCallEnd callId=${callId} duration=${duration}`);
    const call = this.activeCalls.get(callId);
    let calculatedDuration = duration || 0;

    if (!calculatedDuration && call) {
      if (call.connected_at) {
        calculatedDuration = Math.round((Date.now() - call.connected_at.getTime()) / 1000);
      } else {
        calculatedDuration = Math.round((Date.now() - call.started_at.getTime()) / 1000);
      }
    }

    console.log(`[HANGUP] Call ${callId} ended by device`);
    console.log(`[HANGUP] Duration: ${calculatedDuration} seconds`);

    await prisma.call.update({
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
      event: "call:ended",
      call_id: callId,
      duration: calculatedDuration,
      timestamp: new Date().toISOString(),
    });
    console.log(`[SOCKET] Emitted call:ended to all clients`);

    // Also broadcast to update call history
    io.emit("call:history-updated", {
      event: "call:history-updated",
      call_id: callId,
      duration: calculatedDuration,
    });
    console.log(`[SOCKET] Emitted call:history-updated`);

    // Keep existing events for backward compatibility
    io.to(`call_${callId}`).emit("call:hangup", {
      call_id: callId,
      duration: calculatedDuration,
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

  public static async getCallState(callId: string) {
    const active = this.activeCalls.get(callId);
    if (active) return active;

    const call = await prisma.call.findUnique({
      where: { id: callId },
    });
    return call;
  }

  public static broadcastToDevice(device: string, event: string, data: any): void {
    const normalizedDevice = (device === "realme" || device === "realme_c3_1") ? "realme_c3_1" : "iphone";
    logger.debug(`WebRTCSignalServer: broadcastToDevice target=${normalizedDevice} event=${event}`);
    const io = this.getIo();
    io.to(`device_ext:${normalizedDevice}`).emit(event, data);
  }

  private static async joinDevicesToCallRoom(callId: string): Promise<void> {
    try {
      const io = this.getIo();
      const sockets = await io.fetchSockets();
      let joinedCount = 0;
      for (const socket of sockets) {
        const extId = socket.data.externalId;
        if (extId === "realme_c3_1" || extId === "iphone") {
          void socket.join(`call_${callId}`);
          joinedCount++;
        }
      }
      logger.info(`WebRTCSignalServer: joined ${joinedCount} sockets to room call_${callId}`);
    } catch (err) {
      logger.error("WebRTCSignalServer: Failed to join sockets to call room: %O", err);
    }
  }

  private static async cleanupStaleCalls(): Promise<void> {
    logger.info("WebRTCSignalServer: Running periodic cleanup for stale calls...");
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const [id, call] of this.activeCalls.entries()) {
      if (call.started_at < cutoff) {
        logger.warn(`WebRTCSignalServer: Cleaning up stale in-memory call ${id}`);
        this.activeCalls.delete(id);
      }
    }

    try {
      const updated = await prisma.call.updateMany({
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
        logger.warn(`WebRTCSignalServer: Updated ${updated.count} stale DB calls to FAILED status`);
      }
    } catch (err) {
      logger.error("WebRTCSignalServer: Error updating stale calls in DB: %O", err);
    }
  }
}
