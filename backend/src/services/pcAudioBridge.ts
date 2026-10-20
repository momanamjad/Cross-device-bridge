import { spawn, ChildProcess } from "child_process";
import net from "net";
import path from "path";
import fs from "fs";
import { Server } from "socket.io";
import { winstonLogger as logger } from "../lib/winstonLogger";

export interface AudioDevice {
  id: number;
  name: string;
}

export interface AudioDeviceList {
  inputs: AudioDevice[];
  outputs: AudioDevice[];
}

export interface AudioBridgeStats {
  running: boolean;
  activeCallId: string | null;
  inputDevice: AudioDevice | null;
  outputDevice: AudioDevice | null;
  downlinkPackets: number;
  uplinkPackets: number;
  bytesReceived: number;
  bytesSent: number;
}

export class PCAudioBridgeService {
  private static io: Server | null = null;
  private static bridgeProcess: ChildProcess | null = null;
  private static tcpServer: net.Server | null = null;
  private static tcpSocket: net.Socket | null = null;

  private static activeCallId: string | null = null;
  private static selectedInput: AudioDevice | null = null;
  private static selectedOutput: AudioDevice | null = null;

  private static downlinkPackets = 0;
  private static uplinkPackets = 0;
  private static bytesReceived = 0;
  private static bytesSent = 0;

  private static readonly TCP_PORT = 4045;
  private static exePath = path.resolve(__dirname, "../../tools/audio-bridge/device-audio-bridge.exe");

  public static initialize(io: Server) {
    this.io = io;
    logger.info("PCAudioBridgeService initialized");
    // Attempt auto-detection on startup
    this.autoDetectDevices().catch((err) => {
      logger.warn(`PCAudioBridgeService: Auto-detect failed: ${err.message}`);
    });
  }

  public static async getDevices(): Promise<AudioDeviceList> {
    if (!fs.existsSync(this.exePath)) {
      throw new Error(`device-audio-bridge.exe not found at ${this.exePath}`);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(this.exePath, ["--list"]);
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
          const parsed = JSON.parse(jsonStr) as AudioDeviceList;
          resolve(parsed);
        } catch (err: any) {
          reject(new Error(`Failed to parse audio device list: ${err.message}`));
        }
      });
    });
  }

  public static async autoDetectDevices(): Promise<{ input: AudioDevice | null; output: AudioDevice | null }> {
    try {
      const devices = await this.getDevices();

      // Look for Bluetooth Hands-Free devices
      const btKeywords = ["hands-free", "handsfree", "bluetooth", "phone", "realme", "headset"];

      let foundInput = devices.inputs.find((d) =>
        btKeywords.some((k) => d.name.toLowerCase().includes(k))
      );
      let foundOutput = devices.outputs.find((d) =>
        btKeywords.some((k) => d.name.toLowerCase().includes(k))
      );

      // If no Bluetooth device is currently paired, fall back to first device or keep null
      this.selectedInput = foundInput || devices.inputs[0] || null;
      this.selectedOutput = foundOutput || devices.outputs[0] || null;

      logger.info(
        `PCAudioBridgeService: Selected devices -> In: [${this.selectedInput?.id}] ${this.selectedInput?.name}, Out: [${this.selectedOutput?.id}] ${this.selectedOutput?.name}`
      );

      return { input: this.selectedInput, output: this.selectedOutput };
    } catch (err: any) {
      logger.error(`PCAudioBridgeService: Auto-detect error: ${err.message}`);
      return { input: null, output: null };
    }
  }

  public static setDevices(inputId: number, outputId: number, devices: AudioDeviceList) {
    this.selectedInput = devices.inputs.find((d) => d.id === inputId) || null;
    this.selectedOutput = devices.outputs.find((d) => d.id === outputId) || null;
    logger.info(`PCAudioBridgeService: Manually set devices -> In: ${this.selectedInput?.name}, Out: ${this.selectedOutput?.name}`);
  }

  public static async startBridge(callId: string, customInId?: number, customOutId?: number): Promise<boolean> {
    if (this.bridgeProcess) {
      logger.warn(`PCAudioBridge: Bridge already running for call ${this.activeCallId}. Stopping old one.`);
      this.stopBridge();
    }

    if (!fs.existsSync(this.exePath)) {
      logger.error(`PCAudioBridge: Executable not found at ${this.exePath}`);
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
      this.tcpServer = net.createServer((socket) => {
        logger.info("PCAudioBridge: Native audio bridge connected to TCP server");
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
          logger.info("PCAudioBridge: Native audio bridge TCP socket closed");
          this.tcpSocket = null;
        });

        socket.on("error", (err) => {
          logger.warn(`PCAudioBridge: TCP socket error: ${err.message}`);
        });
      });

      this.tcpServer.listen(this.TCP_PORT, "127.0.0.1", () => {
        logger.info(`PCAudioBridge: Listening for native bridge on 127.0.0.1:${this.TCP_PORT}`);

        // 2. Spawn device-audio-bridge.exe
        const args = [
          "--in", inId.toString(),
          "--out", outId.toString(),
          "--port", this.TCP_PORT.toString()
        ];

        logger.info(`PCAudioBridge: Spawning ${this.exePath} ${args.join(" ")}`);
        this.bridgeProcess = spawn(this.exePath, args, { stdio: ["pipe", "pipe", "pipe"] });

        this.bridgeProcess.stdout?.on("data", (d) => {
          logger.info(`[AudioBridge-Out] ${d.toString().trim()}`);
        });

        this.bridgeProcess.stderr?.on("data", (d) => {
          logger.warn(`[AudioBridge-Err] ${d.toString().trim()}`);
        });

        this.bridgeProcess.on("exit", (code) => {
          logger.info(`PCAudioBridge: Process exited with code ${code}`);
          this.stopBridge();
        });

        resolve(true);
      });

      this.tcpServer.on("error", (err) => {
        logger.error(`PCAudioBridge: TCP server failed: ${err.message}`);
        this.stopBridge();
        resolve(false);
      });
    });
  }

  public static sendUplinkChunk(callId: string, pcmBuffer: Buffer): boolean {
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
    } catch (err: any) {
      logger.warn(`PCAudioBridge: Failed to send uplink chunk: ${err.message}`);
      return false;
    }
  }

  public static stopBridge() {
    this.activeCallId = null;

    if (this.bridgeProcess) {
      try {
        this.bridgeProcess.kill();
      } catch (_) {}
      this.bridgeProcess = null;
    }

    if (this.tcpSocket) {
      try {
        this.tcpSocket.destroy();
      } catch (_) {}
      this.tcpSocket = null;
    }

    if (this.tcpServer) {
      try {
        this.tcpServer.close();
      } catch (_) {}
      this.tcpServer = null;
    }

    logger.info("PCAudioBridge: Audio bridge stopped");
  }

  public static getStats(): AudioBridgeStats {
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
