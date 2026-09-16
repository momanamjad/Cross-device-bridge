import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Search multiple possible paths for .env
const envPaths = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(process.cwd(), ".env"),
  "/data/user/0/com.momanamjad.smsbridge/files/backend/.env",
  "/data/data/com.momanamjad.smsbridge/files/backend/.env"
];

for (const p of envPaths) {
  try {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      break;
    }
  } catch (_) {}
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "production",
  port: Number(process.env.PORT ?? 9000),
  databaseUrl: process.env.DATABASE_URL ?? "file:./device_bridge.db",
  registerSecret: process.env.REGISTER_SECRET ?? "super_secret_bridge_key",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  logLevel: process.env.LOG_LEVEL ?? "info",
};
