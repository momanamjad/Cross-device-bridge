"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webrtcCallsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const webrtcCallsController_1 = require("../controllers/webrtcCallsController");
exports.webrtcCallsRouter = (0, express_1.Router)();
// Public Health Check Endpoint
exports.webrtcCallsRouter.get("/health", webrtcCallsController_1.handleHealthRest);
// Protected Signaling & Diagnostics Endpoints
exports.webrtcCallsRouter.post("/incoming", auth_1.requireDeviceAuth, webrtcCallsController_1.handleIncomingCallRest);
exports.webrtcCallsRouter.post("/outgoing", auth_1.requireDeviceAuth, webrtcCallsController_1.handleOutgoingCallRest);
exports.webrtcCallsRouter.post("/ended", auth_1.requireDeviceAuth, webrtcCallsController_1.handleEndedCallRest);
exports.webrtcCallsRouter.get("/stats", auth_1.requireDeviceAuth, webrtcCallsController_1.handleStatsRest);
exports.webrtcCallsRouter.post("/test-signal", auth_1.requireDeviceAuth, webrtcCallsController_1.handleTestSignalRest);
exports.webrtcCallsRouter.get("/history", auth_1.requireDeviceAuth, webrtcCallsController_1.handleHistoryRest);
//# sourceMappingURL=webrtcCalls.js.map