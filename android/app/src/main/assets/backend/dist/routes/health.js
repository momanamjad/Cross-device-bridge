"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const os_1 = __importDefault(require("os"));
const server_1 = require("../server");
function getLocalIP() {
    const interfaces = os_1.default.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === "IPv4" && !iface.internal) {
                candidates.push(iface.address);
            }
        }
    }
    // Prioritize standard local subnet IPs over VPN/Public IPs (e.g. 200.x)
    for (const ip of candidates) {
        if (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
            return ip;
        }
    }
    return candidates.length > 0 ? candidates[0] : "127.0.0.1";
}
exports.healthRouter = (0, express_1.Router)();
exports.healthRouter.get("/", (req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        server_ip: getLocalIP(),
        tunnel_url: server_1.currentTunnelUrl,
    });
});
//# sourceMappingURL=health.js.map