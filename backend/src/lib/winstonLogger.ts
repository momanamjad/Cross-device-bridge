import { createLogger, format, transports } from "winston";
import { env } from "../config/environment";

export const winstonLogger = createLogger({
  level: env.logLevel || "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: "webrtc-signal-service" },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...metadata }) => {
          const { service, ...rest } = metadata;
          let msg = `[${timestamp}] ${level}: ${message}`;
          if (Object.keys(rest).length > 0) {
            msg += ` ${JSON.stringify(rest)}`;
          }
          return msg;
        })
      )
    })
  ]
});
