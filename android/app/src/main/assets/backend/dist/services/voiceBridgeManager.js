"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceBridgeManager = void 0;
const winstonLogger_1 = require("../lib/winstonLogger");
const pcAudioBridge_1 = require("./pcAudioBridge");
const esp32VoiceBridge_1 = require("./esp32VoiceBridge");
class VoiceBridgeManager {
    static mode = process.env.VOICE_BRIDGE_MODE || "auto";
    static initialize(io) {
        pcAudioBridge_1.PCAudioBridgeService.initialize(io);
        esp32VoiceBridge_1.ESP32VoiceBridgeService.initialize(io);
        winstonLogger_1.winstonLogger.info(`VoiceBridgeManager initialized (mode: ${this.mode})`);
    }
    static setMode(mode) {
        this.mode = mode;
        winstonLogger_1.winstonLogger.info(`VoiceBridgeManager: Mode updated to ${mode}`);
    }
    static getMode() {
        return this.mode;
    }
    static getActiveType() {
        if (this.mode === "pc")
            return "pc";
        if (this.mode === "esp32")
            return "esp32";
        // In "auto" mode: if ESP-32 board is active/connected, route via ESP-32; else fallback to PC Bluetooth
        if (esp32VoiceBridge_1.ESP32VoiceBridgeService.isEsp32Connected()) {
            return "esp32";
        }
        return "pc";
    }
    static async onCallAccept(callId) {
        const active = this.getActiveType();
        winstonLogger_1.winstonLogger.info(`VoiceBridgeManager: onCallAccept for ${callId} -> routing via [${active.toUpperCase()}]`);
        if (active === "esp32") {
            esp32VoiceBridge_1.ESP32VoiceBridgeService.setActiveCall(callId);
        }
        else {
            await pcAudioBridge_1.PCAudioBridgeService.startBridge(callId);
        }
    }
    static onCallEnd() {
        esp32VoiceBridge_1.ESP32VoiceBridgeService.setActiveCall(null);
        pcAudioBridge_1.PCAudioBridgeService.stopBridge();
    }
    static sendUplinkChunk(callId, pcmBuffer) {
        const active = this.getActiveType();
        if (active === "esp32") {
            esp32VoiceBridge_1.ESP32VoiceBridgeService.sendUplinkChunk(callId, pcmBuffer);
        }
        else {
            pcAudioBridge_1.PCAudioBridgeService.sendUplinkChunk(callId, pcmBuffer);
        }
    }
    static getStats() {
        return {
            mode: this.mode,
            activeType: this.getActiveType(),
            pcStats: pcAudioBridge_1.PCAudioBridgeService.getStats(),
            esp32Stats: esp32VoiceBridge_1.ESP32VoiceBridgeService.getStats(),
        };
    }
}
exports.VoiceBridgeManager = VoiceBridgeManager;
//# sourceMappingURL=voiceBridgeManager.js.map