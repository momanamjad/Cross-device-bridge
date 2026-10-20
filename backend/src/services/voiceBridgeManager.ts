import { Server } from "socket.io";
import { winstonLogger as logger } from "../lib/winstonLogger";
import { PCAudioBridgeService } from "./pcAudioBridge";
import { ESP32VoiceBridgeService } from "./esp32VoiceBridge";

export type VoiceBridgeMode = "auto" | "pc" | "esp32";

export class VoiceBridgeManager {
  private static mode: VoiceBridgeMode = (process.env.VOICE_BRIDGE_MODE as VoiceBridgeMode) || "auto";

  public static initialize(io: Server) {
    PCAudioBridgeService.initialize(io);
    ESP32VoiceBridgeService.initialize(io);
    logger.info(`VoiceBridgeManager initialized (mode: ${this.mode})`);
  }

  public static setMode(mode: VoiceBridgeMode) {
    this.mode = mode;
    logger.info(`VoiceBridgeManager: Mode updated to ${mode}`);
  }

  public static getMode(): VoiceBridgeMode {
    return this.mode;
  }

  public static getActiveType(): "pc" | "esp32" {
    if (this.mode === "pc") return "pc";
    if (this.mode === "esp32") return "esp32";
    // In "auto" mode: if ESP-32 board is active/connected, route via ESP-32; else fallback to PC Bluetooth
    if (ESP32VoiceBridgeService.isEsp32Connected()) {
      return "esp32";
    }
    return "pc";
  }

  public static async onCallAccept(callId: string) {
    const active = this.getActiveType();
    logger.info(`VoiceBridgeManager: onCallAccept for ${callId} -> routing via [${active.toUpperCase()}]`);
    if (active === "esp32") {
      ESP32VoiceBridgeService.setActiveCall(callId);
    } else {
      await PCAudioBridgeService.startBridge(callId);
    }
  }

  public static onCallEnd() {
    ESP32VoiceBridgeService.setActiveCall(null);
    PCAudioBridgeService.stopBridge();
  }

  public static sendUplinkChunk(callId: string, pcmBuffer: Buffer) {
    const active = this.getActiveType();
    if (active === "esp32") {
      ESP32VoiceBridgeService.sendUplinkChunk(callId, pcmBuffer);
    } else {
      PCAudioBridgeService.sendUplinkChunk(callId, pcmBuffer);
    }
  }

  public static getStats() {
    return {
      mode: this.mode,
      activeType: this.getActiveType(),
      pcStats: PCAudioBridgeService.getStats(),
      esp32Stats: ESP32VoiceBridgeService.getStats(),
    };
  }
}
