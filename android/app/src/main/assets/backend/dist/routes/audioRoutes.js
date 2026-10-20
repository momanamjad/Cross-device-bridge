"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audioRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const audioController_1 = require("../controllers/audioController");
exports.audioRouter = (0, express_1.Router)();
exports.audioRouter.get("/mode", auth_1.requireDeviceAuth, audioController_1.getAudioMode);
exports.audioRouter.post("/mode", auth_1.requireDeviceAuth, audioController_1.setAudioMode);
exports.audioRouter.get("/devices", auth_1.requireDeviceAuth, audioController_1.getAudioDevices);
exports.audioRouter.post("/select", auth_1.requireDeviceAuth, audioController_1.selectAudioDevices);
exports.audioRouter.get("/stats", auth_1.requireDeviceAuth, audioController_1.getAudioStats);
//# sourceMappingURL=audioRoutes.js.map