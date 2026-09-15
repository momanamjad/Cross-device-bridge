"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireDeviceAuth = requireDeviceAuth;
const database_1 = require("../config/database");
const errorHandler_1 = require("./errorHandler");
const crypto_1 = require("../lib/crypto");
async function requireDeviceAuth(req, _res, next) {
    try {
        const header = req.header("authorization");
        if (!header?.startsWith("Bearer ")) {
            throw new errorHandler_1.HttpError(401, "Invalid API token");
        }
        const token = header.slice("Bearer ".length).trim();
        if (!token) {
            throw new errorHandler_1.HttpError(401, "Invalid API token");
        }
        const device = await database_1.prisma.device.findFirst({
            where: { tokenHash: (0, crypto_1.hashToken)(token), isActive: true },
        });
        if (!device) {
            throw new errorHandler_1.HttpError(401, "Invalid API token");
        }
        await database_1.prisma.device.update({
            where: { id: device.id },
            data: { lastSeen: new Date() },
        });
        req.device = device;
        next();
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=auth.js.map