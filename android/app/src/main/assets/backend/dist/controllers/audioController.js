"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAudioMode = getAudioMode;
exports.setAudioMode = setAudioMode;
exports.getAudioDevices = getAudioDevices;
exports.selectAudioDevices = selectAudioDevices;
exports.getAudioStats = getAudioStats;
const zod_1 = require("zod");
const pcAudioBridge_1 = require("../services/pcAudioBridge");
const voiceBridgeManager_1 = require("../services/voiceBridgeManager");
const errorHandler_1 = require("../middleware/errorHandler");
const selectAudioSchema = zod_1.z.object({
    input_id: zod_1.z.number().int().nonnegative(),
    output_id: zod_1.z.number().int().nonnegative(),
});
const setModeSchema = zod_1.z.object({
    mode: zod_1.z.enum(["auto", "pc", "esp32"]),
});
async function getAudioMode(req, res, next) {
    try {
        const mode = voiceBridgeManager_1.VoiceBridgeManager.getMode();
        const activeType = voiceBridgeManager_1.VoiceBridgeManager.getActiveType();
        res.json({ mode, activeType });
    }
    catch (err) {
        next(err);
    }
}
async function setAudioMode(req, res, next) {
    try {
        const body = setModeSchema.parse(req.body);
        voiceBridgeManager_1.VoiceBridgeManager.setMode(body.mode);
        const mode = voiceBridgeManager_1.VoiceBridgeManager.getMode();
        const activeType = voiceBridgeManager_1.VoiceBridgeManager.getActiveType();
        res.json({ success: true, mode, activeType });
    }
    catch (err) {
        next(err);
    }
}
async function getAudioDevices(req, res, next) {
    try {
        const devices = await pcAudioBridge_1.PCAudioBridgeService.getDevices();
        const stats = pcAudioBridge_1.PCAudioBridgeService.getStats();
        res.json({
            devices,
            selected: {
                input: stats.inputDevice,
                output: stats.outputDevice,
            },
            stats,
        });
    }
    catch (err) {
        next(new errorHandler_1.HttpError(500, err.message || "Failed to query audio devices"));
    }
}
async function selectAudioDevices(req, res, next) {
    try {
        const body = selectAudioSchema.parse(req.body);
        const devices = await pcAudioBridge_1.PCAudioBridgeService.getDevices();
        pcAudioBridge_1.PCAudioBridgeService.setDevices(body.input_id, body.output_id, devices);
        const stats = pcAudioBridge_1.PCAudioBridgeService.getStats();
        res.json({
            success: true,
            selected: {
                input: stats.inputDevice,
                output: stats.outputDevice,
            },
        });
    }
    catch (err) {
        next(err);
    }
}
async function getAudioStats(req, res, next) {
    try {
        const stats = voiceBridgeManager_1.VoiceBridgeManager.getStats();
        res.json({ stats });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=audioController.js.map