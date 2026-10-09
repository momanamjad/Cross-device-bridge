import { Router } from "express";
import { requireDeviceAuth } from "../middleware/auth";
import { getAudioDevices, selectAudioDevices, getAudioStats } from "../controllers/audioController";

export const audioRouter = Router();

audioRouter.get("/devices", requireDeviceAuth, getAudioDevices);
audioRouter.post("/select", requireDeviceAuth, selectAudioDevices);
audioRouter.get("/stats", requireDeviceAuth, getAudioStats);
