import { Router } from "express";
import os from "os";
import { currentTunnelUrl } from "../server";

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

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

export const healthRouter = Router();

healthRouter.get("/", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    server_ip: getLocalIP(),
    tunnel_url: currentTunnelUrl,
  });
});
