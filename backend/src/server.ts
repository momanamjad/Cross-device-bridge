import { createServer } from "http";
import { env } from "./config/environment";
import { prisma } from "./config/database";
import { createApp } from "./app";
import { initSocket } from "./services/socketService";
import { logger } from "./lib/logger";
import fs from "fs";

// In embedded Android environment, process.exit kills the host Android app.
// Intercept process.exit to prevent crashing the entire mobile app.
const originalExit = process.exit;
process.exit = ((code?: number) => {
  const msg = `[WARN] process.exit(${code}) called in Node.js - intercepted to keep host Android app alive!`;
  console.error(msg);
  logger.error(msg);
}) as any;

if (process.env.LOG_FILE_PATH) {
  const logFilePath = process.env.LOG_FILE_PATH;
  const writeLog = (msg: string) => {
    try {
      fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${msg}\n`, "utf8");
    } catch (e) {
      // Ignore file writing errors
    }
  };

  console.log = (...args) => writeLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  console.error = (...args) => writeLog("[ERROR] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  console.warn = (...args) => writeLog("[WARN] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));

  process.on("uncaughtException", (err) => {
    writeLog(`[FATAL] Uncaught Exception: ${err?.stack || err}`);
    logger.error({ err }, "Uncaught Exception in Node.js");
  });

  process.on("unhandledRejection", (reason) => {
    writeLog(`[FATAL] Unhandled Rejection: ${reason}`);
    logger.error({ reason }, "Unhandled Rejection in Node.js");
  });
}

import localtunnel from "localtunnel";

export let currentTunnelUrl: string | null = null;

async function setupTunnel(port: number) {
  try {
    const tunnel = await localtunnel({ port });
    currentTunnelUrl = tunnel.url;
    logger.info({ tunnelUrl: tunnel.url }, "Localtunnel successfully started");

    tunnel.on("error", (err: any) => {
      logger.warn({ err: err?.message || err }, "Localtunnel client error");
      currentTunnelUrl = null;
    });

    tunnel.on("close", () => {
      logger.warn("Localtunnel closed, reconnecting in 15s...");
      currentTunnelUrl = null;
      setTimeout(() => setupTunnel(port), 15000);
    });
  } catch (err: any) {
    logger.warn({ err: err?.message || err }, "Failed to start localtunnel (optional)");
    currentTunnelUrl = null;
    setTimeout(() => setupTunnel(port), 30000);
  }
}

async function main() {
  const app = createApp();
  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(env.port, "0.0.0.0", () => {
    logger.info({ port: env.port }, "device-bridge api listening");
    setupTunnel(env.port);
  });
}

main().catch(async (err) => {
  logger.error({ err }, "failed to start");
  await prisma.$disconnect();
});
