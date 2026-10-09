import dgram from "dgram";
import { Server } from "socket.io";
import { winstonLogger as logger } from "../lib/winstonLogger";

export interface ESP32BridgeStats {
  running: boolean;
  activeCallId: string | null;
  esp32Ip: string | null;
  downlinkPackets: number;
  uplinkPackets: number;
  bytesReceived: number;
  bytesSent: number;
}

export class ESP32VoiceBridgeService {
  private static io: Server | null = null;
  private static udpSocket: dgram.Socket | null = null;
  private static readonly UDP_PORT = 4050;

  private static activeCallId: string | null = null;
  private static esp32RemoteAddr: { address: string; port: number } | null = null;

  private static downlinkPackets = 0;
  private static uplinkPackets = 0;
  private static bytesReceived = 0;
  private static bytesSent = 0;

  public static initialize(io: Server) {
    this.io = io;
    logger.info("ESP32VoiceBridgeService initialized");
    this.startUdpListener();
  }

  private static startUdpListener() {
    if (this.udpSocket) return;

    this.udpSocket = dgram.createSocket("udp4");

    this.udpSocket.on("listening", () => {
      const addr = this.udpSocket?.address();
      logger.info(`ESP32VoiceBridge: UDP listener active on port ${addr?.port}`);
    });

    this.udpSocket.on("message", (msg, rinfo) => {
      // Remember ESP32 address for sending uplink voice back
      this.esp32RemoteAddr = { address: rinfo.address, port: rinfo.port };
      this.bytesReceived += msg.length;
      this.downlinkPackets++;

      // If there is an active call, forward caller audio to iPhone via Socket.io
      if (this.io && this.activeCallId) {
        this.io.to(`call_${this.activeCallId}`).emit("call:audio-downlink", {
          call_id: this.activeCallId,
          pcm: msg.toString("base64"),
          seq: this.downlinkPackets,
          timestamp: Date.now(),
        });
      }
    });

    this.udpSocket.on("error", (err) => {
      logger.error(`ESP32VoiceBridge: UDP socket error: ${err.message}`);
    });

    try {
      this.udpSocket.bind(this.UDP_PORT);
    } catch (err: any) {
      logger.error(`ESP32VoiceBridge: Failed to bind UDP port ${this.UDP_PORT}: ${err.message}`);
    }
  }

  public static setActiveCall(callId: string | null) {
    this.activeCallId = callId;
    if (callId) {
      logger.info(`ESP32VoiceBridge: Active call set to ${callId}`);
    } else {
      logger.info("ESP32VoiceBridge: Active call cleared");
    }
  }

  public static sendUplinkChunk(callId: string, pcmBuffer: Buffer): boolean {
    if (!this.udpSocket || !this.esp32RemoteAddr || this.activeCallId !== callId) {
      return false;
    }

    try {
      this.udpSocket.send(pcmBuffer, this.esp32RemoteAddr.port, this.esp32RemoteAddr.address);
      this.uplinkPackets++;
      this.bytesSent += pcmBuffer.length;
      return true;
    } catch (err: any) {
      logger.warn(`ESP32VoiceBridge: Failed to send UDP uplink chunk: ${err.message}`);
      return false;
    }
  }

  public static getStats(): ESP32BridgeStats {
    return {
      running: this.udpSocket !== null,
      activeCallId: this.activeCallId,
      esp32Ip: this.esp32RemoteAddr ? `${this.esp32RemoteAddr.address}:${this.esp32RemoteAddr.port}` : null,
      downlinkPackets: this.downlinkPackets,
      uplinkPackets: this.uplinkPackets,
      bytesReceived: this.bytesReceived,
      bytesSent: this.bytesSent,
    };
  }

  public static stop() {
    this.activeCallId = null;
    if (this.udpSocket) {
      try {
        this.udpSocket.close();
      } catch (_) {}
      this.udpSocket = null;
    }
    logger.info("ESP32VoiceBridge: Stopped");
  }
}
