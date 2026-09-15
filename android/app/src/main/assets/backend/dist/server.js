"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentTunnelUrl = void 0;
const http_1 = require("http");
const environment_1 = require("./config/environment");
const database_1 = require("./config/database");
const app_1 = require("./app");
const socketService_1 = require("./services/socketService");
const logger_1 = require("./lib/logger");
const fs_1 = __importDefault(require("fs"));
if (process.env.LOG_FILE_PATH) {
    const logFilePath = process.env.LOG_FILE_PATH;
    const writeLog = (msg) => {
        try {
            fs_1.default.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${msg}\n`, "utf8");
        }
        catch (e) {
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
const localtunnel_1 = __importDefault(require("localtunnel"));
exports.currentTunnelUrl = null;
async function setupTunnel(port) {
    try {
        const tunnel = await (0, localtunnel_1.default)({ port });
        exports.currentTunnelUrl = tunnel.url;
        logger_1.logger.info({ tunnelUrl: tunnel.url }, "Localtunnel successfully started");
        tunnel.on("close", () => {
            logger_1.logger.warn("Localtunnel closed, reconnecting in 5s...");
            exports.currentTunnelUrl = null;
            setTimeout(() => setupTunnel(port), 5000);
        });
    }
    catch (err) {
        logger_1.logger.error({ err }, "Failed to start localtunnel");
        exports.currentTunnelUrl = null;
        setTimeout(() => setupTunnel(port), 5000);
    }
}
async function main() {
    const app = (0, app_1.createApp)();
    const httpServer = (0, http_1.createServer)(app);
    (0, socketService_1.initSocket)(httpServer);
    httpServer.listen(environment_1.env.port, "0.0.0.0", () => {
        logger_1.logger.info({ port: environment_1.env.port }, "device-bridge api listening");
        setupTunnel(environment_1.env.port);
    });
}
main().catch(async (err) => {
    logger_1.logger.error({ err }, "failed to start");
    await database_1.prisma.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=server.js.map