import { Router } from "express";
import { requireDeviceAuth } from "../middleware/auth";
import {
  handleIncomingCallRest,
  handleOutgoingCallRest,
  handleEndedCallRest,
  handleHealthRest,
  handleStatsRest,
  handleTestSignalRest,
  handleHistoryRest,
} from "../controllers/webrtcCallsController";

export const webrtcCallsRouter = Router();

// Public Health Check Endpoint
webrtcCallsRouter.get("/health", handleHealthRest);

// Protected Signaling & Diagnostics Endpoints
webrtcCallsRouter.post("/incoming", requireDeviceAuth, handleIncomingCallRest);
webrtcCallsRouter.post("/outgoing", requireDeviceAuth, handleOutgoingCallRest);
webrtcCallsRouter.post("/ended", requireDeviceAuth, handleEndedCallRest);
webrtcCallsRouter.get("/stats", requireDeviceAuth, handleStatsRest);
webrtcCallsRouter.post("/test-signal", requireDeviceAuth, handleTestSignalRest);
webrtcCallsRouter.get("/history", requireDeviceAuth, handleHistoryRest);
