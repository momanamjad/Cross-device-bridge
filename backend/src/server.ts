import { createServer } from "http";
import { env } from "./config/environment";
import { prisma } from "./config/database";
import { createApp } from "./app";
import { initSocket } from "./services/socketService";
import { logger } from "./lib/logger";
import fs from "fs";

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
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    writeLog(`[FATAL] Unhandled Rejection: ${reason}`);
  });
}

import localtunnel from "localtunnel";

export let currentTunnelUrl: string | null = null;

async function setupTunnel(port: number) {
  try {
    const tunnel = await localtunnel({ port });
    currentTunnelUrl = tunnel.url;
    logger.info({ tunnelUrl: tunnel.url }, "Localtunnel successfully started");

    tunnel.on("close", () => {
      logger.warn("Localtunnel closed, reconnecting in 5s...");
      currentTunnelUrl = null;
      setTimeout(() => setupTunnel(port), 5000);
    });
  } catch (err) {
    logger.error({ err }, "Failed to start localtunnel");
    currentTunnelUrl = null;
    setTimeout(() => setupTunnel(port), 5000);
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
  process.exit(1);
});
