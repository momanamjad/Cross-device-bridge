import { createServer } from "http";
import { env } from "./config/environment";
import { prisma } from "./config/database";
import { createApp } from "./app";
import { initSocket } from "./services/socketService";
import { logger } from "./lib/logger";

async function main() {
  const app = createApp();
  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(env.port, "0.0.0.0", () => {
    logger.info({ port: env.port }, "device-bridge api listening");
  });
}

main().catch(async (err) => {
  logger.error({ err }, "failed to start");
  await prisma.$disconnect();
  process.exit(1);
});
