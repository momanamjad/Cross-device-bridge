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
  };
}
