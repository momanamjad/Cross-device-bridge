import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { HttpError } from "../middleware/errorHandler";
import type { AuthedRequest } from "../middleware/auth";
import { callSchema, listQuerySchema, smsSchema } from "../lib/schemas";
import { emitToDevice } from "../services/socketService";

function deviceOf(req: Request) {
  return (req as AuthedRequest).device;
}

export async function createSms(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const device = deviceOf(req);
    const body = smsSchema.parse(req.body);
    if (body.device_id !== device.externalId) {
      throw new HttpError(403, "device_id does not match token");
    }

    const message = await prisma.message.create({
      data: {
        deviceId: device.id,
        sender: body.sender,
        content: body.message,
        timestamp: new Date(body.timestamp),
      },
    });

    const payload = {
      id: message.id,
      sender: message.sender,
      message: message.content,
      content: message.content,
      timestamp: message.timestamp.toISOString(),
      synced: message.synced,
    };
    emitToDevice(device.id, "message:new", payload);

    res.status(201).json({
      status: "success",
      message_id: message.id,
      received_at: message.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function createCall(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const device = deviceOf(req);
    const body = callSchema.parse(req.body);
    if (body.device_id !== device.externalId) {
      throw new HttpError(403, "device_id does not match token");
    }

    const call = await prisma.callNotification.create({
      data: {
        deviceId: device.id,
        caller: body.caller,
        callState: body.state,
        timestamp: new Date(body.timestamp),
        duration: body.duration ?? 0,
      },
    });

    emitToDevice(device.id, "call:new", {
      id: call.id,
      caller: call.caller,
      state: call.callState,
      timestamp: call.timestamp.toISOString(),
      duration: call.duration,
    });

    res.status(201).json({
      status: "success",
      call_id: call.id,
    });
  } catch (err) {
    next(err);
  }
}

async function getTargetDeviceId(req: Request): Promise<string> {
  const device = deviceOf(req);
  if (device.deviceType === "ios") {
    const androidDevice = await prisma.device.findFirst({
      where: { deviceType: "android", isActive: true },
    });
    if (androidDevice) {
      return androidDevice.id;
    }
  }
  return device.id;
}

export async function listMessages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listQuerySchema.parse(req.query);
    const targetDeviceId = await getTargetDeviceId(req);
    const where = {
      deviceId: targetDeviceId,
      ...(query.synced === undefined ? {} : { synced: query.synced }),
    };

    const [total, rows] = await Promise.all([
      prisma.message.count({ where }),
      prisma.message.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    res.json({
      status: "success",
      data: rows.map((m) => ({
        id: m.id,
        sender: m.sender,
        message: m.content,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        synced: m.synced,
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (err) {
    next(err);
  }
}

export async function listCalls(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listQuerySchema.parse(req.query);
    const targetDeviceId = await getTargetDeviceId(req);
    const where = {
      deviceId: targetDeviceId,
      ...(query.synced === undefined ? {} : { synced: query.synced }),
    };

    const [total, rows] = await Promise.all([
      prisma.callNotification.count({ where }),
      prisma.callNotification.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    res.json({
      status: "success",
      data: rows.map((c) => ({
        id: c.id,
        caller: c.caller,
        state: c.callState,
        timestamp: c.timestamp.toISOString(),
        duration: c.duration,
        synced: c.synced,
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (err) {
    next(err);
  }
}

export async function confirmMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id;
    const targetDeviceId = await getTargetDeviceId(req);
    const result = await prisma.message.updateMany({
      where: { id, deviceId: targetDeviceId },
      data: { synced: true, syncedAt: new Date() },
    });
    if (result.count === 0) {
      throw new HttpError(404, "Message not found");
    }
    res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
}

export async function confirmCall(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id;
    const targetDeviceId = await getTargetDeviceId(req);
    const result = await prisma.callNotification.updateMany({
      where: { id, deviceId: targetDeviceId },
      data: { synced: true, syncedAt: new Date() },
    });
    if (result.count === 0) {
      throw new HttpError(404, "Call not found");
    }
    res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
}
