import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { env } from "../config/environment";
import { HttpError } from "../middleware/errorHandler";
import { generateApiToken, hashToken, secretsEqual } from "../lib/crypto";
import { registerDeviceSchema } from "../lib/schemas";

export async function registerDevice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const secret = req.header("x-register-secret") ?? "";
    if (!secretsEqual(secret, env.registerSecret)) {
      throw new HttpError(401, "Invalid register secret");
    }

    const body = registerDeviceSchema.parse(req.body);
    const apiToken = generateApiToken();
    const tokenHash = hashToken(apiToken);

    const device = await prisma.device.upsert({
      where: { externalId: body.device_id },
      create: {
        externalId: body.device_id,
        deviceName: body.device_name,
        deviceType: body.device_type,
        osVersion: body.os_version ?? "",
        tokenHash,
      },
      update: {
        deviceName: body.device_name,
        deviceType: body.device_type,
        osVersion: body.os_version ?? "",
        tokenHash,
        isActive: true,
      },
    });

    res.status(201).json({
      status: "success",
      api_token: apiToken,
      device_id: device.externalId,
    });
  } catch (err) {
    next(err);
  }
}
