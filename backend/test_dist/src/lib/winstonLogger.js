"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.winstonLogger = void 0;
const winston_1 = require("winston");
const environment_1 = require("../config/environment");
exports.winstonLogger = (0, winston_1.createLogger)({
    level: environment_1.env.logLevel || "info",
    format: winston_1.format.combine(winston_1.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), winston_1.format.errors({ stack: true }), winston_1.format.splat(), winston_1.format.json()),
    defaultMeta: { service: "webrtc-signal-service" },
    transports: [
        new winston_1.transports.Console({
            format: winston_1.format.combine(winston_1.format.colorize(), winston_1.format.printf(({ timestamp, level, message, ...metadata }) => {
                const { service, ...rest } = metadata;
                let msg = `[${timestamp}] ${level}: ${message}`;
                if (Object.keys(rest).length > 0) {
                    msg += ` ${JSON.stringify(rest)}`;
                }
                return msg;
            }))
        })
    ]
});
