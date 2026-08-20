import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../config/database";
import { HttpError } from "../middleware/errorHandler";
import type { AuthedRequest } from "../middleware/auth";
import { WebRTCSignalServer } from "../services/webrtcSignal";
import { getIo } from "../services/socketService";
import { winstonLogger as logger } from "../lib/winstonLogger";

// Request schemas
export const restIncomingSchema = z.object({
  caller_number: z.string().min(1),
  device_id: z.string().min(1),
  timestamp: z.number().int().positive().optional(),
});

export const restOutgoingSchema = z.object({
  phone_number: z.string().min(1),
  device_id: z.string().min(1),
});

export const restEndedSchema = z.object({
  call_id: z.string().min(1),
  duration_seconds: z.number().int().nonnegative(),
});

export const restTestSignalSchema = z.object({
  call_id: z.string().min(1),
});

function deviceOf(req: Request) {
  return (req as AuthedRequest).device;
}

export async function handleIncomingCallRest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const device = deviceOf(req);
    const body = restIncomingSchema.parse(req.body);

    logger.info(`REST API: handleIncomingCall device=${device.externalId} caller=${body.caller_number}`);

    if (device.externalId !== "realme_c3_1") {
      throw new HttpError(403, "Only realme_c3_1 is authorized to signal incoming SIM calls");
    }

    if (body.device_id !== device.externalId) {
      throw new HttpError(400, "device_id in request body does not match authorized device");
    }

    const callId = randomUUID();
    await WebRTCSignalServer.handleIncomingCall(body.caller_number, callId);

    res.status(201).json({
      call_id: callId,
      status: "created",
    });
  } catch (err) {
    next(err);
  }
}

export async function handleOutgoingCallRest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const device = deviceOf(req);
    const body = restOutgoingSchema.parse(req.body);

    logger.info(`REST API: handleOutgoingCall initiator=${device.externalId} target_device=${body.device_id} phone=${body.phone_number}`);

    const targetDevice = await prisma.device.findUnique({
      where: { externalId: body.device_id },
    });
    if (!targetDevice) {
      throw new HttpError(404, `Target device ${body.device_id} not found in database`);
    }

    const callId = randomUUID();
    await WebRTCSignalServer.handleOutgoingCall(body.phone_number, callId);

    res.status(201).json({
      call_id: callId,
      status: "dialing",
    });
  } catch (err) {
    next(err);
  }
}

export async function handleEndedCallRest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = restEndedSchema.parse(req.body);
    logger.info(`REST API: handleEndedCall call_id=${body.call_id} duration_seconds=${body.duration_seconds}`);

    await WebRTCSignalServer.handleCallEnd(body.call_id, body.duration_seconds);

    res.status(200).json({
      status: "recorded",
    });
  } catch (err) {
    next(err);
  }
}

export async function handleHealthRest(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({
      status: "ok",
      webrtc_signal_server: "ready",
    });
  } catch (err) {
    next(err);
  }
}

export async function handleStatsRest(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const activeCallsCount = WebRTCSignalServer.getActiveCallsCount();

    const callsToday = await prisma.call.findMany({
      where: {
        created_at: {
          gte: startOfToday,
        },
      },
      select: {
        duration_seconds: true,
      },
    });

    const totalToday = callsToday.length;
    const totalDuration = callsToday.reduce((sum, c) => sum + c.duration_seconds, 0);
    const avgDuration = totalToday > 0 ? Math.round(totalDuration / totalToday) : 0;

    res.status(200).json({
      active_calls: activeCallsCount,
      total_today: totalToday,
      avg_duration: avgDuration,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleTestSignalRest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = restTestSignalSchema.parse(req.body);
    logger.info(`REST API: handleTestSignal call_id=${body.call_id}`);
    const io = getIo();
    
    const timestamp = Date.now();
    io.to(`call_${body.call_id}`).emit("webrtc:test-signal", {
      call_id: body.call_id,
      timestamp,
      message: "Test signal from server",
    });

    res.status(200).json({
      message_received: true,
      timestamp,
    });
  } catch (err) {
    next(err);
  }
}
