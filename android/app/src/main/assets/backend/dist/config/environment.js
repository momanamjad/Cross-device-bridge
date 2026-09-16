"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Search multiple possible paths for .env
const envPaths = [
    path_1.default.resolve(__dirname, "../../.env"),
    path_1.default.resolve(__dirname, "../.env"),
    path_1.default.resolve(process.cwd(), ".env"),
    "/data/user/0/com.momanamjad.smsbridge/files/backend/.env",
    "/data/data/com.momanamjad.smsbridge/files/backend/.env"
];
for (const p of envPaths) {
    try {
        if (fs_1.default.existsSync(p)) {
            dotenv_1.default.config({ path: p });
            break;
        }
    }
    catch (_) { }
}
exports.env = {
    nodeEnv: process.env.NODE_ENV ?? "production",
    port: Number(process.env.PORT ?? 9000),
    databaseUrl: process.env.DATABASE_URL ?? "file:./device_bridge.db",
    registerSecret: process.env.REGISTER_SECRET ?? "super_secret_bridge_key",
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    logLevel: process.env.LOG_LEVEL ?? "info",
};
//# sourceMappingURL=environment.js.map