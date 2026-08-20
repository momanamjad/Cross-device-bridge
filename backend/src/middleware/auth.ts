import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/database";
import { HttpError } from "./errorHandler";
import { hashToken } from "../lib/crypto";
import type { Device } from "@prisma/client";

export type AuthedRequest = Request & { device: Device };

export async function requireDeviceAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new HttpError(401, "Invalid API token");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new HttpError(401, "Invalid API token");
    }

    const device = await prisma.device.findFirst({
      where: { tokenHash: hashToken(token), isActive: true },
    });
    if (!device) {
      throw new HttpError(401, "Invalid API token");
    }

    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeen: new Date() },
    });

    (req as AuthedRequest).device = device;
    next();
  } catch (err) {
    next(err);
  }
}
