import pino from "pino";
import { env } from "../config/environment";

export const logger = pino({
  level: env.logLevel,
  transport:
    env.nodeEnv === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
