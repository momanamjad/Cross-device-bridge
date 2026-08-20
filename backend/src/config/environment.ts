import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  registerSecret: required("REGISTER_SECRET"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  logLevel: process.env.LOG_LEVEL ?? "info",
};
