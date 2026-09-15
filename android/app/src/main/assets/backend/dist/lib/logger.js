"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const environment_1 = require("../config/environment");
const streams = [];
if (process.env.LOG_FILE_PATH) {
    streams.push({ stream: pino_1.default.destination({ dest: process.env.LOG_FILE_PATH, sync: true }) });
}
else {
    // Fallback to stdout
    streams.push({ stream: pino_1.default.destination(1) });
}
exports.logger = (0, pino_1.default)({
    level: environment_1.env.logLevel,
}, pino_1.default.multistream(streams));
//# sourceMappingURL=logger.js.map