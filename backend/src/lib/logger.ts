import pino from "pino";
import { env } from "../config/environment";

const streams: any[] = [];

if (process.env.LOG_FILE_PATH) {
  streams.push({ stream: pino.destination({ dest: process.env.LOG_FILE_PATH, sync: true }) });
} else {
  // Fallback to stdout
  streams.push({ stream: pino.destination(1) });
}

export const logger = pino({
  level: env.logLevel,
}, pino.multistream(streams));
