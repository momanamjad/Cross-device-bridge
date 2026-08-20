import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      status: "error",
      message: "Invalid request",
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ status: "error", message: err.message });
    return;
  }

  logger.error({ err }, "unhandled error");
  res.status(500).json({ status: "error", message: "Internal server error" });
}
