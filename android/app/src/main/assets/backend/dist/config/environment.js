"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../.env") });
function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
exports.env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: required("DATABASE_URL"),
    registerSecret: required("REGISTER_SECRET"),
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    logLevel: process.env.LOG_LEVEL ?? "info",
};
//# sourceMappingURL=environment.js.map