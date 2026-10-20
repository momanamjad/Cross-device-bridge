"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PCAudioBridgeService = void 0;
const child_process_1 = require("child_process");
const net_1 = __importDefault(require("net"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const winstonLogger_1 = require("../lib/winstonLogger");
class PCAudioBridgeService {
    static io = null;
    static bridgeProcess = null;
    static tcpServer = null;
    static tcpSocket = null;
    static activeCallId = null;
    static selectedInput = null;
    static selectedOutput = null;
    static downlinkPackets = 0;
    static uplinkPackets = 0;
    static bytesReceived = 0;
    static bytesSent = 0;
    static TCP_PORT = 4045;
    static exePath = path_1.default.resolve(__dirname, "../../tools/audio-bridge/device-audio-bridge.exe");
    static initialize(io) {
        this.io = io;
        winstonLogger_1.winstonLogger.info("PCAudioBridgeService initialized");
        // Attempt auto-detection on startup
        this.autoDetectDevices().catch((err) => {
            winstonLogger_1.winstonLogger.warn(`PCAudioBridgeService: Auto-detect failed: ${err.message}`);
        });
    }
    static async getDevices() {
        if (!fs_1.default.existsSync(this.exePath)) {
            throw new Error(`device-audio-bridge.exe not found at ${this.exePath}`);
        }
        return new Promise((resolve, reject) => {
            const proc = (0, child_process_1.spawn)(this.exePath, ["--list"]);
            let stdout = "";
            let stderr = "";
            proc.stdout.on("data", (data) => {
                stdout += data.toString();
            });
            proc.stderr.on("data", (data) => {
                stderr += data.toString();
            });
            proc.on("close", (code) => {
                if (code !== 0) {
                    reject(new Error(`device-audio-bridge --list failed with code ${code}: ${stderr}`));
                    return;
                }
                try {
                    // Output might have compiler notices if built dynamically, find first '{'
                    const jsonStart = stdout.indexOf("{");
                    if (jsonStart === -1) {
                        reject(new Error(`Invalid JSON output: ${stdout}`));
                        return;
                    }
                    const jsonStr = stdout.substring(jsonStart).trim();
                    const parsed = JSON.parse(jsonStr);
                    resolve(parsed);
                }
                catch (err) {
                    reject(new Error(`Failed to parse audio device list: ${err.message}`));
                }
            });
        });
    }
    static async autoDetectDevices() {
        try {
            const devices = await this.getDevices();
            // Look for Bluetooth Hands-Free devices
            const btKeywords = ["hands-free", "handsfree", "bluetooth", "phone", "realme", "headset"];
            let foundInput = devices.inputs.find((d) => btKeywords.some((k) => d.name.toLowerCase().includes(k)));
            let foundOutput = devices.outputs.find((d) => btKeywords.some((k) => d.name.toLowerCase().includes(k)));
            // If no Bluetooth device is currently paired, fall back to first device or keep null
            this.selectedInput = foundInput || devices.inputs[0] || null;
            this.selectedOutput = foundOutput || devices.outputs[0] || null;
            winstonLogger_1.winstonLogger.info(`PCAudioBridgeService: Selected devices -> In: [${this.selectedInput?.id}] ${this.selectedInput?.name}, Out: [${this.selectedOutput?.id}] ${this.selectedOutput?.name}`);
            return { input: this.selectedInput, output: this.selectedOutput };
        }
        catch (err) {
            winstonLogger_1.winstonLogger.error(`PCAudioBridgeService: Auto-detect error: ${err.message}`);
            return { input: null, output: null };
        }
    }
    static setDevices(inputId, outputId, devices) {
        this.selectedInput = devices.inputs.find((d) => d.id === inputId) || null;
        this.selectedOutput = devices.outputs.find((d) => d.id === outputId) || null;
        winstonLogger_1.winstonLogger.info(`PCAudioBridgeService: Manually set devices -> In: ${this.selectedInput?.name}, Out: ${this.selectedOutput?.name}`);
    }
    static async startBridge(callId, customInId, customOutId) {
        if (this.bridgeProcess) {
            winstonLogger_1.winstonLogger.warn(`PCAudioBridge: Bridge already running for call ${this.activeCallId}. Stopping old one.`);
            this.stopBridge();
        }
        if (!fs_1.default.existsSync(this.exePath)) {
            winstonLogger_1.winstonLogger.error(`PCAudioBridge: Executable not found at ${this.exePath}`);
            return false;
        }
        const inId = customInId !== undefined ? customInId : (this.selectedInput?.id ?? 0);
        const outId = customOutId !== undefined ? customOutId : (this.selectedOutput?.id ?? 0);
        this.activeCallId = callId;
        this.downlinkPackets = 0;
        this.uplinkPackets = 0;
        this.bytesReceived = 0;
        this.bytesSent = 0;
        return new Promise((resolve) => {
            // 1. Start local TCP Server
            this.tcpServer = net_1.default.createServer((socket) => {
                winstonLogger_1.winstonLogger.info("PCAudioBridge: Native audio bridge connected to TCP server");
                this.tcpSocket = socket;
                let incomingBuffer = Buffer.alloc(0);
                socket.on("data", (chunk) => {
                    this.bytesReceived += chunk.length;
                    incomingBuffer = Buffer.concat([incomingBuffer, chunk]);
                    // Process length-prefixed frames (2 bytes length + PCM)
                    while (incomingBuffer.length >= 2) {
                        const frameLen = incomingBuffer.readUInt16LE(0);
                        if (incomingBuffer.length < 2 + frameLen) {
                            break; // Wait for full frame
                        }
                        const pcmFrame = incomingBuffer.subarray(2, 2 + frameLen);
                        incomingBuffer = incomingBuffer.subarray(2 + frameLen);
                        this.downlinkPackets++;
                        // Emit caller voice chunk to iPhone
                        if (this.io && this.activeCallId) {
                            this.io.to(`call_${this.activeCallId}`).emit("call:audio-downlink", {
                                call_id: this.activeCallId,
                                pcm: pcmFrame.toString("base64"),
                                seq: this.downlinkPackets,
                                timestamp: Date.now(),
                            });
                        }
                    }
                });
                socket.on("close", () => {
                    winstonLogger_1.winstonLogger.info("PCAudioBridge: Native audio bridge TCP socket closed");
                    this.tcpSocket = null;
                });
                socket.on("error", (err) => {
                    winstonLogger_1.winstonLogger.warn(`PCAudioBridge: TCP socket error: ${err.message}`);
                });
            });
            this.tcpServer.listen(this.TCP_PORT, "127.0.0.1", () => {
                winstonLogger_1.winstonLogger.info(`PCAudioBridge: Listening for native bridge on 127.0.0.1:${this.TCP_PORT}`);
                // 2. Spawn device-audio-bridge.exe
                const args = [
                    "--in", inId.toString(),
                    "--out", outId.toString(),
                    "--port", this.TCP_PORT.toString()
                ];
                winstonLogger_1.winstonLogger.info(`PCAudioBridge: Spawning ${this.exePath} ${args.join(" ")}`);
                this.bridgeProcess = (0, child_process_1.spawn)(this.exePath, args, { stdio: ["pipe", "pipe", "pipe"] });
                this.bridgeProcess.stdout?.on("data", (d) => {
                    winstonLogger_1.winstonLogger.info(`[AudioBridge-Out] ${d.toString().trim()}`);
                });
                this.bridgeProcess.stderr?.on("data", (d) => {
                    winstonLogger_1.winstonLogger.warn(`[AudioBridge-Err] ${d.toString().trim()}`);
                });
                this.bridgeProcess.on("exit", (code) => {
                    winstonLogger_1.winstonLogger.info(`PCAudioBridge: Process exited with code ${code}`);
                    this.stopBridge();
                });
                resolve(true);
            });
            this.tcpServer.on("error", (err) => {
                winstonLogger_1.winstonLogger.error(`PCAudioBridge: TCP server failed: ${err.message}`);
                this.stopBridge();
                resolve(false);
            });
        });
    }
    static sendUplinkChunk(callId, pcmBuffer) {
        if (!this.tcpSocket || this.activeCallId !== callId) {
            return false;
        }
        try {
            const lenBuf = Buffer.alloc(2);
            lenBuf.writeUInt16LE(pcmBuffer.length, 0);
            this.tcpSocket.write(lenBuf);
            this.tcpSocket.write(pcmBuffer);
            this.uplinkPackets++;
            this.bytesSent += pcmBuffer.length + 2;
            return true;
        }
        catch (err) {
            winstonLogger_1.winstonLogger.warn(`PCAudioBridge: Failed to send uplink chunk: ${err.message}`);
            return false;
        }
    }
    static stopBridge() {
        this.activeCallId = null;
        if (this.bridgeProcess) {
            try {
                this.bridgeProcess.kill();
            }
            catch (_) { }
            this.bridgeProcess = null;
        }
        if (this.tcpSocket) {
            try {
                this.tcpSocket.destroy();
            }
            catch (_) { }
            this.tcpSocket = null;
        }
        if (this.tcpServer) {
            try {
                this.tcpServer.close();
            }
            catch (_) { }
            this.tcpServer = null;
        }
        winstonLogger_1.winstonLogger.info("PCAudioBridge: Audio bridge stopped");
    }
    static getStats() {
        return {
            running: this.bridgeProcess !== null,
            activeCallId: this.activeCallId,
            inputDevice: this.selectedInput,
            outputDevice: this.selectedOutput,
            downlinkPackets: this.downlinkPackets,
            uplinkPackets: this.uplinkPackets,
            bytesReceived: this.bytesReceived,
            bytesSent: this.bytesSent,
        };
    }
}
exports.PCAudioBridgeService = PCAudioBridgeService;
//# sourceMappingURL=pcAudioBridge.js.map