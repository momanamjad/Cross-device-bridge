import fs from "fs";

const logFilePath = process.env.LOG_FILE_PATH || "/data/user/0/com.momanamjad.smsbridge/files/node_out.txt";
const writeLog = (msg: string) => {
  try {
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${msg}\n`, "utf8");
  } catch (_) {}
};

// In embedded Android environment, process.exit kills the host Android app.
process.exit = ((code?: number) => {
  writeLog(`[WARN] process.exit(${code}) called in Node.js - intercepted to keep host Android app alive!`);
}) as any;

console.log = (...args) => writeLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
console.error = (...args) => writeLog("[ERROR] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
console.warn = (...args) => writeLog("[WARN] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));

process.on("uncaughtException", (err) => {
  writeLog(`[FATAL] Uncaught Exception in Node.js: ${err?.stack || err}`);
});

process.on("unhandledRejection", (reason) => {
  writeLog(`[FATAL] Unhandled Rejection in Node.js: ${reason}`);
});

writeLog(">>> [server.ts]: Node.js early execution started <<<");

import { createServer } from "http";
import { env } from "./config/environment";
import { prisma } from "./config/database";
import { createApp } from "./app";
import { initSocket } from "./services/socketService";
import { logger } from "./lib/logger";

writeLog(`>>> [server.ts]: Core modules imported. Config: port=${env.port}, db=${env.databaseUrl} <<<`);

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

  httpServer.listen(env.port, () => {
    logger.info({ port: env.port }, "device-bridge api listening");
    if (process.env.LOG_FILE_PATH) {
      try {
        fs.appendFileSync(process.env.LOG_FILE_PATH, `[${new Date().toISOString()}] >>> device-bridge api listening on port ${env.port} <<<\n`, "utf8");
      } catch (_) {}
    }
    setupTunnel(env.port);
  });
}

main().catch(async (err) => {
  logger.error({ err }, "failed to start");
  if (process.env.LOG_FILE_PATH) {
    try {
      fs.appendFileSync(process.env.LOG_FILE_PATH, `[${new Date().toISOString()}] [FATAL ERROR]: ${err?.stack || err}\n`, "utf8");
    } catch (_) {}
  }
  await prisma.$disconnect();
});
