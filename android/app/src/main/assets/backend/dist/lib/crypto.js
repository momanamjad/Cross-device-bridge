"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateApiToken = generateApiToken;
exports.hashToken = hashToken;
exports.tokensEqual = tokensEqual;
exports.secretsEqual = secretsEqual;
exports.deriveKey = deriveKey;
exports.encryptPayload = encryptPayload;
exports.decryptPayload = decryptPayload;
const crypto_1 = require("crypto");
function generateApiToken() {
    return (0, crypto_1.randomBytes)(32).toString("hex");
}
function hashToken(token) {
    return (0, crypto_1.createHash)("sha256").update(token).digest("hex");
}
function tokensEqual(a, b) {
    const ha = Buffer.from(hashToken(a), "hex");
    const hb = Buffer.from(hashToken(b), "hex");
    if (ha.length !== hb.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(ha, hb);
}
function secretsEqual(provided, expected) {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
        return false;
    }
    return (0, crypto_1.timingSafeEqual)(a, b);
}
const crypto_2 = require("crypto");
const ALGORITHM = "aes-256-gcm";
const ITERATIONS = 100000;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;
function deriveKey(secret, salt) {
    return (0, crypto_2.pbkdf2Sync)(secret, salt, ITERATIONS, KEY_LEN, "sha256");
}
function encryptPayload(data, secret) {
    const jsonStr = JSON.stringify(data);
    const salt = (0, crypto_1.randomBytes)(SALT_LEN);
    const iv = (0, crypto_1.randomBytes)(IV_LEN);
    const key = deriveKey(secret, salt);
    const cipher = (0, crypto_2.createCipheriv)(ALGORITHM, key, iv);
    let encrypted = cipher.update(jsonStr, "utf8", "base64");
    encrypted += cipher.final("base64");
    const authTag = cipher.getAuthTag();
    return `${salt.toString("base64")}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}
function decryptPayload(payloadStr, secret) {
    if (typeof payloadStr !== "string")
        return payloadStr;
    const parts = payloadStr.split(":");
    if (parts.length !== 4)
        return payloadStr; // not encrypted
    const salt = Buffer.from(parts[0], "base64");
    const iv = Buffer.from(parts[1], "base64");
    const authTag = Buffer.from(parts[2], "base64");
    const ciphertext = parts[3];
    const key = deriveKey(secret, salt);
    const decipher = (0, crypto_2.createDecipheriv)(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
}
//# sourceMappingURL=crypto.js.map