import type { Request, Response, NextFunction } from "express";
import { encryptPayload } from "../lib/crypto";
import { env } from "../config/environment";

export function encryptRestResponse(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json;
  res.json = function (body) {
    if (req.path.includes("/health")) {
      return originalJson.call(this, body);
    }
    // Include top-level fields for direct Android/REST consumers, and encrypted data for iOS
    if (res.statusCode >= 200 && res.statusCode < 300 && body && typeof body === "object") {
      const encrypted = encryptPayload(body, env.registerSecret);
      if (Array.isArray(body)) {
        return originalJson.call(this, { data: encrypted, items: body });
      }
      return originalJson.call(this, {
        ...body,
        data: encrypted,
      });
    }
    return originalJson.call(this, body);
  };
  next();
}
