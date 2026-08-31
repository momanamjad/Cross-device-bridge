import type { Request, Response, NextFunction } from "express";
import { encryptPayload } from "../lib/crypto";
import { env } from "../config/environment";

export function encryptRestResponse(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json;
  res.json = function (body) {
    // Only encrypt successful responses
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const encrypted = encryptPayload(body, env.registerSecret);
      return originalJson.call(this, { data: encrypted });
    }
    return originalJson.call(this, body);
  };
  next();
}
