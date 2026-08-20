import { useEffect } from "react";
import { createApi } from "../services/api";
import {
  confirmSocketCall,
  confirmSocketMessage,
  connectSocket,
  disconnectSocket,
} from "../services/socket";
import { useBridgeStore } from "../store";
import type { Message } from "../types";

function notify(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

export function useBridgeRealtime() {
  const apiUrl = useBridgeStore((s) => s.apiUrl);
  const token = useBridgeStore((s) => s.token);
  const setStatus = useBridgeStore((s) => s.setStatus);
  const setMessages = useBridgeStore((s) => s.setMessages);
  const setCalls = useBridgeStore((s) => s.setCalls);
  const addMessage = useBridgeStore((s) => s.addMessage);
  const addCall = useBridgeStore((s) => s.addCall);

  useEffect(() => {
    if (!apiUrl || !token) {
      setStatus("offline");
      disconnectSocket();
      return;
    }

    let cancelled = false;
    setStatus("connecting");

    const api = createApi(apiUrl, token);
    void (async () => {
      try {
        const [msgs, calls] = await Promise.all([
          api.getMessages(50, 0),
          api.getCalls(50, 0),
        ]);
        if (cancelled) return;
        setMessages(
          msgs.data.data.map((m: Message & { message?: string }) => ({
            ...m,
            content: m.content || m.message || "",
          })),
        );
        setCalls(calls.data.data);
      } catch {
        if (!cancelled) setStatus("offline");
      }
    })();

    connectSocket(apiUrl, token, {
      onConnect: () => setStatus("connected"),
      onDisconnect: () => setStatus("offline"),
      onMessage: (msg) => {
        addMessage(msg);
        confirmSocketMessage(msg.id);
        notify("New SMS", `${msg.sender}: ${msg.content.slice(0, 80)}`);
      },
      onCall: (call) => {
        addCall(call);
        confirmSocketCall(call.id);
        notify("Incoming call", `${call.caller} (${call.state})`);
      },
    });

    return () => {
      cancelled = true;
      disconnectSocket();
    };
  }, [apiUrl, token, addCall, addMessage, setCalls, setMessages, setStatus]);
}
