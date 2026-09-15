"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const logger_1 = require("../lib/logger");
class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = "HttpError";
    }
}
exports.HttpError = HttpError;
function errorHandler(err, _req, res, _next) {
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({
            status: "error",
            message: "Invalid request",
            details: err.flatten(),
        });
        return;
    }
    if (err instanceof HttpError) {
        res.status(err.status).json({ status: "error", message: err.message });
        return;
    }
    logger_1.logger.error({ err }, "unhandled error");
    res.status(500).json({ status: "error", message: "Internal server error" });
}
//# sourceMappingURL=errorHandler.js.map