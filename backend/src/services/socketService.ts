import { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { env } from "../config/environment";
import { prisma } from "../config/database";
import { hashToken, encryptPayload, decryptPayload } from "../lib/crypto";
import { logger } from "../lib/logger";
import { registerCallHandlers } from "../sockets/callHandlers";
import { WebRTCSignalServer } from "./webrtcSignal";

let io: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.nodeEnv === "development" ? true : env.corsOrigin.split(",").map((s) => s.trim()),
      methods: ["GET", "POST"],
    },
  });

  // Initialize WebRTC signaling service
  WebRTCSignalServer.initialize(io);

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.query?.token as string | undefined);
      if (!token) {
        next(new Error("unauthorized"));
        return;
      }
      const device = await prisma.device.findFirst({
        where: { tokenHash: hashToken(token), isActive: true },
      });
      if (!device) {
        next(new Error("unauthorized"));
        return;
      }
      socket.data.deviceId = device.id;
      socket.data.externalId = device.externalId;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on("connection", (socket: Socket) => {
    const deviceId = socket.data.deviceId as string;
    const externalId = socket.data.externalId as string;
    const room = `device:${deviceId}`;
    const extRoom = `device_ext:${externalId}`;
    void socket.join(room);
    void socket.join(extRoom);
    
    socket.use(([event, ...args], next) => {
      if (args.length > 0 && args[0] && typeof args[0] === "object" && typeof args[0].data === "string") {
        try {
          args[0] = decryptPayload(args[0].data, env.registerSecret);
        } catch (err) {
          logger.error({ err }, "Failed to decrypt incoming socket payload");
          return next(new Error("Decryption failed"));
        }
      }
      next();
    });

    logger.info({ deviceId, externalId, sid: socket.id }, "socket connected");

    const statusPayload = {
      device_id: externalId,
      status: "online",
      last_seen: new Date().toISOString(),
    };
    socket.emit("device:status", { data: encryptPayload(statusPayload, env.registerSecret) });

    socket.on("message:confirm", async (payload: { id?: string }) => {
      if (!payload?.id) return;
      await prisma.message.updateMany({
        where: { id: payload.id, deviceId },
        data: { synced: true, syncedAt: new Date() },
      });
    });

    socket.on("call:confirm", async (payload: { id?: string }) => {
      if (!payload?.id) return;
      await prisma.callNotification.updateMany({
        where: { id: payload.id, deviceId },
        data: { synced: true, syncedAt: new Date() },
      });
    });

    // Register WebRTC Call handlers
    registerCallHandlers(io!, socket);

    socket.on("disconnect", () => {
      logger.info({ deviceId, externalId, sid: socket.id }, "socket disconnected");
    });
  });

  return io;
}

export function getIo(): Server {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
}

export function emitToDevice(
  deviceId: string,
  event: "message:new" | "call:new" | "device:status" | "file:received",
  payload: unknown,
): void {
  if (!io) return;
  const encrypted = encryptPayload(payload, env.registerSecret);
  io.to(`device:${deviceId}`).emit(event, { data: encrypted });
}

export function emitToDeviceRaw(
  deviceId: string,
  event: string,
  payload: unknown,
): void {
  if (!io) return;
  io.to(`device:${deviceId}`).emit(event, payload);
}
