import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/environment";
import { logger } from "./lib/logger";
import { errorHandler } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";
import { devicesRouter } from "./routes/devices";
import { callsRouter, messagesRouter } from "./routes/messages";
import { webrtcCallsRouter } from "./routes/webrtcCalls";
import { encryptRestResponse } from "./middleware/encryption";
import { filesRouter } from "./routes/files";
import path from "path";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: env.nodeEnv === "development" ? true : env.corsOrigin.split(",").map((s) => s.trim()),
    }),
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(pinoHttp({ logger }));

  app.use("/api/health", healthRouter);
  app.use("/api/devices", encryptRestResponse, devicesRouter);
  app.use("/api/messages", encryptRestResponse, messagesRouter);
  app.use("/api/calls", encryptRestResponse, webrtcCallsRouter);
  app.use("/api/calls", encryptRestResponse, callsRouter);
  app.use("/api/files", encryptRestResponse, filesRouter);
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.use(errorHandler);
  return app;
}
