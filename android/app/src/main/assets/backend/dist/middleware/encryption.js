"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptRestResponse = encryptRestResponse;
const crypto_1 = require("../lib/crypto");
const environment_1 = require("../config/environment");
function encryptRestResponse(req, res, next) {
    const originalJson = res.json;
    res.json = function (body) {
        if (req.path.includes("/health")) {
            return originalJson.call(this, body);
        }
        // Include top-level fields for direct Android/REST consumers, and encrypted data for iOS
        if (res.statusCode >= 200 && res.statusCode < 300 && body && typeof body === "object") {
            const encrypted = (0, crypto_1.encryptPayload)(body, environment_1.env.registerSecret);
            if (Array.isArray(body)) {
                return originalJson.call(this, { data: encrypted, items: body });
            }
            return originalJson.call(this, {
                ...body,
                data: encrypted,
            });
        }
        return originalJson.call(this, body);
    };
    next();
}
//# sourceMappingURL=encryption.js.map