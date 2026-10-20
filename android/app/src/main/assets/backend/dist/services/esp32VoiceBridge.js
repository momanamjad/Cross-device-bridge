"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESP32VoiceBridgeService = void 0;
const dgram_1 = __importDefault(require("dgram"));
const winstonLogger_1 = require("../lib/winstonLogger");
class ESP32VoiceBridgeService {
    static io = null;
    static udpSocket = null;
    static UDP_PORT = 4050;
    static activeCallId = null;
    static esp32RemoteAddr = null;
    static downlinkPackets = 0;
    static uplinkPackets = 0;
    static bytesReceived = 0;
    static bytesSent = 0;
    static initialize(io) {
        this.io = io;
        winstonLogger_1.winstonLogger.info("ESP32VoiceBridgeService initialized");
        this.startUdpListener();
    }
    static startUdpListener() {
        if (this.udpSocket)
            return;
        this.udpSocket = dgram_1.default.createSocket("udp4");
        this.udpSocket.on("listening", () => {
            const addr = this.udpSocket?.address();
            winstonLogger_1.winstonLogger.info(`ESP32VoiceBridge: UDP listener active on port ${addr?.port}`);
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
            winstonLogger_1.winstonLogger.error(`ESP32VoiceBridge: UDP socket error: ${err.message}`);
        });
        try {
            this.udpSocket.bind(this.UDP_PORT);
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`ESP32VoiceBridge: Failed to bind UDP port ${this.UDP_PORT}: ${err.message}`);
        }
    }
    static setActiveCall(callId) {
        this.activeCallId = callId;
        if (callId) {
            winstonLogger_1.winstonLogger.info(`ESP32VoiceBridge: Active call set to ${callId}`);
        }
        else {
            winstonLogger_1.winstonLogger.info("ESP32VoiceBridge: Active call cleared");
        }
    }
    static sendUplinkChunk(callId, pcmBuffer) {
        if (!this.udpSocket || !this.esp32RemoteAddr || this.activeCallId !== callId) {
            return false;
        }
        try {
            this.udpSocket.send(pcmBuffer, this.esp32RemoteAddr.port, this.esp32RemoteAddr.address);
            this.uplinkPackets++;
            this.bytesSent += pcmBuffer.length;
            return true;
        }
        catch (err) {
            winstonLogger_1.winstonLogger.warn(`ESP32VoiceBridge: Failed to send UDP uplink chunk: ${err.message}`);
            return false;
        }
    }
    static getStats() {
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
    static isEsp32Connected() {
        return this.esp32RemoteAddr !== null;
    }
    static reset() {
        this.esp32RemoteAddr = null;
        this.activeCallId = null;
        this.downlinkPackets = 0;
        this.uplinkPackets = 0;
        this.bytesReceived = 0;
        this.bytesSent = 0;
    }
    static stop() {
        this.reset();
        if (this.udpSocket) {
            try {
                this.udpSocket.close();
            }
            catch (_) { }
            this.udpSocket = null;
        }
        winstonLogger_1.winstonLogger.info("ESP32VoiceBridge: Stopped");
    }
}
exports.ESP32VoiceBridgeService = ESP32VoiceBridgeService;
//# sourceMappingURL=esp32VoiceBridge.js.map