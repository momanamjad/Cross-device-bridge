import { Router } from "express";
import { prisma } from "../config/database";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  let database: "connected" | "disconnected" = "disconnected";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "connected";
  } catch {
    database = "disconnected";
  }

  res.json({
    status: database === "connected" ? "ok" : "degraded",
    uptime: Math.round(process.uptime()),
    database,
  });
});
