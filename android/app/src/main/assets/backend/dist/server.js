"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentTunnelUrl = void 0;
const fs_1 = __importDefault(require("fs"));
const logFilePath = process.env.LOG_FILE_PATH || "/data/user/0/com.momanamjad.smsbridge/files/node_out.txt";
const writeLog = (msg) => {
    try {
        fs_1.default.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${msg}\n`, "utf8");
    }
    catch (_) { }
};
// In embedded Android environment, process.exit kills the host Android app.
process.exit = ((code) => {
    writeLog(`[WARN] process.exit(${code}) called in Node.js - intercepted to keep host Android app alive!`);
});
console.log = (...args) => writeLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
console.error = (...args) => writeLog("[ERROR] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
console.warn = (...args) => writeLog("[WARN] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
process.on("uncaughtException", (err) => {
    writeLog(`[FATAL] Uncaught Exception in Node.js: ${err?.stack || err}`);
});
process.on("unhandledRejection", (reason) => {
    writeLog(`[FATAL] Unhandled Rejection in Node.js: ${reason}`);
});
const path_1 = __importDefault(require("path"));
writeLog(">>> [server.ts]: Node.js early execution started <<<");
try {
    const backendBaseDir = path_1.default.resolve(__dirname, "..");
    process.chdir(backendBaseDir);
    writeLog(`>>> [server.ts]: Working directory switched to ${process.cwd()} <<<`);
}
catch (e) {
    writeLog(`>>> [server.ts]: Failed to change working directory: ${e?.message} <<<`);
}
const http_1 = require("http");
const environment_1 = require("./config/environment");
const database_1 = require("./config/database");
const app_1 = require("./app");
const socketService_1 = require("./services/socketService");
const logger_1 = require("./lib/logger");
writeLog(`>>> [server.ts]: Core modules imported. Config: port=${environment_1.env.port}, db=${environment_1.env.databaseUrl} <<<`);
const localtunnel_1 = __importDefault(require("localtunnel"));
exports.currentTunnelUrl = null;
async function setupTunnel(port) {
    try {
        const tunnel = await (0, localtunnel_1.default)({ port });
        exports.currentTunnelUrl = tunnel.url;
        logger_1.logger.info({ tunnelUrl: tunnel.url }, "Localtunnel successfully started");
        tunnel.on("error", (err) => {
            logger_1.logger.warn({ err: err?.message || err }, "Localtunnel client error");
            exports.currentTunnelUrl = null;
        });
        tunnel.on("close", () => {
            logger_1.logger.warn("Localtunnel closed, reconnecting in 15s...");
            exports.currentTunnelUrl = null;
            setTimeout(() => setupTunnel(port), 15000);
        });
    }
    catch (err) {
        logger_1.logger.warn({ err: err?.message || err }, "Failed to start localtunnel (optional)");
        exports.currentTunnelUrl = null;
        setTimeout(() => setupTunnel(port), 30000);
    }
}
async function main() {
    const app = (0, app_1.createApp)();
    const httpServer = (0, http_1.createServer)(app);
    (0, socketService_1.initSocket)(httpServer);
    httpServer.listen(environment_1.env.port, () => {
        logger_1.logger.info({ port: environment_1.env.port }, "device-bridge api listening");
        if (process.env.LOG_FILE_PATH) {
            try {
                fs_1.default.appendFileSync(process.env.LOG_FILE_PATH, `[${new Date().toISOString()}] >>> device-bridge api listening on port ${environment_1.env.port} <<<\n`, "utf8");
            }
            catch (_) { }
        }
        setupTunnel(environment_1.env.port);
    });
}
main().catch(async (err) => {
    logger_1.logger.error({ err }, "failed to start");
    if (process.env.LOG_FILE_PATH) {
        try {
            fs_1.default.appendFileSync(process.env.LOG_FILE_PATH, `[${new Date().toISOString()}] [FATAL ERROR]: ${err?.stack || err}\n`, "utf8");
        }
        catch (_) { }
    }
    await database_1.prisma.$disconnect();
});
//# sourceMappingURL=server.js.map