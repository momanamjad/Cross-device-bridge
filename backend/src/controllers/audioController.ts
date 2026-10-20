import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PCAudioBridgeService } from "../services/pcAudioBridge";
import { VoiceBridgeManager, VoiceBridgeMode } from "../services/voiceBridgeManager";
import { HttpError } from "../middleware/errorHandler";

const selectAudioSchema = z.object({
  input_id: z.number().int().nonnegative(),
  output_id: z.number().int().nonnegative(),
});

const setModeSchema = z.object({
  mode: z.enum(["auto", "pc", "esp32"]),
});

export async function getAudioMode(req: Request, res: Response, next: NextFunction) {
  try {
    const mode = VoiceBridgeManager.getMode();
    const activeType = VoiceBridgeManager.getActiveType();
    res.json({ mode, activeType });
  } catch (err: any) {
    next(err);
  }
}

export async function setAudioMode(req: Request, res: Response, next: NextFunction) {
  try {
    const body = setModeSchema.parse(req.body);
    VoiceBridgeManager.setMode(body.mode as VoiceBridgeMode);
    const mode = VoiceBridgeManager.getMode();
    const activeType = VoiceBridgeManager.getActiveType();
    res.json({ success: true, mode, activeType });
  } catch (err: any) {
    next(err);
  }
}

export async function getAudioDevices(req: Request, res: Response, next: NextFunction) {
  try {
    const devices = await PCAudioBridgeService.getDevices();
    const stats = PCAudioBridgeService.getStats();

    res.json({
      devices,
      selected: {
        input: stats.inputDevice,
        output: stats.outputDevice,
      },
      stats,
    });
  } catch (err: any) {
    next(new HttpError(500, err.message || "Failed to query audio devices"));
  }
}

export async function selectAudioDevices(req: Request, res: Response, next: NextFunction) {
  try {
    const body = selectAudioSchema.parse(req.body);
    const devices = await PCAudioBridgeService.getDevices();

    PCAudioBridgeService.setDevices(body.input_id, body.output_id, devices);
    const stats = PCAudioBridgeService.getStats();

    res.json({
      success: true,
      selected: {
        input: stats.inputDevice,
        output: stats.outputDevice,
      },
    });
  } catch (err: any) {
    next(err);
  }
}

export async function getAudioStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = VoiceBridgeManager.getStats();
    res.json({ stats });
  } catch (err: any) {
    next(err);
  }
}
