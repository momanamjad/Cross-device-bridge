import { io, type Socket } from "socket.io-client";
import type { CallEvent, Message } from "../types";

let socket: Socket | null = null;

export function connectSocket(
  url: string,
  token: string,
  handlers: {
    onConnect: () => void;
    onDisconnect: () => void;
    onMessage: (msg: Message) => void;
    onCall: (call: CallEvent) => void;
  },
): Socket {
  disconnectSocket();
  socket = io(url, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
  });

  socket.on("connect", handlers.onConnect);
  socket.on("disconnect", handlers.onDisconnect);
  socket.on("connect_error", handlers.onDisconnect);
  socket.on("message:new", (payload: Message & { message?: string }) => {
    handlers.onMessage({
      id: payload.id,
      sender: payload.sender,
      content: payload.content || payload.message || "",
      timestamp: payload.timestamp,
      synced: payload.synced ?? false,
    });
  });
  socket.on("call:new", handlers.onCall);
  return socket;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

export function confirmSocketMessage(id: string) {
  socket?.emit("message:confirm", { id });
}

export function confirmSocketCall(id: string) {
  socket?.emit("call:confirm", { id });
}
