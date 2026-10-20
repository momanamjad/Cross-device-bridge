import { Router } from "express";
import { requireDeviceAuth } from "../middleware/auth";
import {
  getAudioDevices,
  selectAudioDevices,
  getAudioStats,
  getAudioMode,
  setAudioMode,
} from "../controllers/audioController";

export const audioRouter = Router();

audioRouter.get("/mode", requireDeviceAuth, getAudioMode);
audioRouter.post("/mode", requireDeviceAuth, setAudioMode);
audioRouter.get("/devices", requireDeviceAuth, getAudioDevices);
audioRouter.post("/select", requireDeviceAuth, selectAudioDevices);
audioRouter.get("/stats", requireDeviceAuth, getAudioStats);

