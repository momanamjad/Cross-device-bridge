"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDevice = registerDevice;
const database_1 = require("../config/database");
const environment_1 = require("../config/environment");
const errorHandler_1 = require("../middleware/errorHandler");
const crypto_1 = require("../lib/crypto");
const schemas_1 = require("../lib/schemas");
async function registerDevice(req, res, next) {
    try {
        const secret = req.header("x-register-secret") ?? "";
        if (!(0, crypto_1.secretsEqual)(secret, environment_1.env.registerSecret)) {
            throw new errorHandler_1.HttpError(401, "Invalid register secret");
        }
        const body = schemas_1.registerDeviceSchema.parse(req.body);
        const apiToken = (0, crypto_1.generateApiToken)();
        const tokenHash = (0, crypto_1.hashToken)(apiToken);
        const device = await database_1.prisma.device.upsert({
            where: { externalId: body.device_id },
            create: {
                externalId: body.device_id,
                deviceName: body.device_name,
                deviceType: body.device_type,
                osVersion: body.os_version ?? "",
                tokenHash,
            },
            update: {
                deviceName: body.device_name,
                deviceType: body.device_type,
                osVersion: body.os_version ?? "",
                tokenHash,
                isActive: true,
            },
        });
        res.status(201).json({
            status: "success",
            api_token: apiToken,
            device_id: device.externalId,
        });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=devicesController.js.map