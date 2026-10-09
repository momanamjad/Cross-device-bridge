import axios from "axios";
import type { CallEvent, Message, Paginated } from "../types";

export function createApi(baseURL: string, token: string) {
  const client = axios.create({
    baseURL,
    timeout: 15000,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  return {
    health: () => client.get("/api/health"),
    getMessages: (limit = 50, offset = 0) =>
      client.get<Paginated<Message & { message?: string }>>("/api/messages", {
        params: { limit, offset },
      }),
    getCalls: (limit = 50, offset = 0) =>
      client.get<Paginated<CallEvent>>("/api/calls", {
        params: { limit, offset },
      }),
    confirmMessage: (id: string) => client.post(`/api/messages/${id}/confirm`),
    confirmCall: (id: string) => client.post(`/api/calls/${id}/confirm`),
    getAudioMode: () => client.get<{ mode: string; activeType: string }>("/api/audio/mode"),
    setAudioMode: (mode: "auto" | "pc" | "esp32") => client.post("/api/audio/mode", { mode }),
    getAudioDevices: () => client.get("/api/audio/devices"),
    selectAudioDevices: (input_id: number, output_id: number) =>
      client.post("/api/audio/select", { input_id, output_id }),
    getAudioStats: () => client.get("/api/audio/stats"),
  };
}
