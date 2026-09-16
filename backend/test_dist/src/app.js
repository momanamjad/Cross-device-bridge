"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = require("express");
const cors_1 = require("cors");
const helmet_1 = require("helmet");
const pino_http_1 = require("pino-http");
const environment_1 = require("./config/environment");
const logger_1 = require("./lib/logger");
const errorHandler_1 = require("./middleware/errorHandler");
const health_1 = require("./routes/health");
const devices_1 = require("./routes/devices");
const messages_1 = require("./routes/messages");
const webrtcCalls_1 = require("./routes/webrtcCalls");
const encryption_1 = require("./middleware/encryption");
const path_1 = require("path");
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({
        origin: environment_1.env.nodeEnv === "development" ? true : environment_1.env.corsOrigin.split(",").map((s) => s.trim()),
    }));
    app.use(express_1.default.json({ limit: "256kb" }));
    app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
    app.use("/api/health", health_1.healthRouter);
    app.use("/api/devices", encryption_1.encryptRestResponse, devices_1.devicesRouter);
    app.use("/api/messages", encryption_1.encryptRestResponse, messages_1.messagesRouter);
    app.use("/api/calls", encryption_1.encryptRestResponse, webrtcCalls_1.webrtcCallsRouter);
    app.use("/api/calls", encryption_1.encryptRestResponse, messages_1.callsRouter);
    const uploadDir = process.env.STORAGE_DIR ? path_1.default.join(process.env.STORAGE_DIR, "uploads") : path_1.default.join(process.cwd(), "uploads");
    try {
        if (!path_1.default.isAbsolute(uploadDir) || !require("fs").existsSync(uploadDir)) {
            require("fs").mkdirSync(uploadDir, { recursive: true });
        }
    }
    catch (_) { }
    app.use("/uploads", express_1.default.static(uploadDir));
    app.use(errorHandler_1.errorHandler);
    return app;
}
