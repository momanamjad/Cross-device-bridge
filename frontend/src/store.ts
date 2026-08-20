import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CallEvent, ConnectionStatus, Message } from "./types";

const defaultApi = import.meta.env.VITE_API_URL || "http://localhost:4000";

interface BridgeState {
  apiUrl: string;
  token: string;
  status: ConnectionStatus;
  messages: Message[];
  calls: CallEvent[];
  expandedId: string | null;
  setApiUrl: (url: string) => void;
  setToken: (token: string) => void;
  setStatus: (status: ConnectionStatus) => void;
  setMessages: (messages: Message[]) => void;
  setCalls: (calls: CallEvent[]) => void;
  addMessage: (message: Message) => void;
  addCall: (call: CallEvent) => void;
  setExpandedId: (id: string | null) => void;
}

export const useBridgeStore = create<BridgeState>()(
  persist(
    (set) => ({
      apiUrl: defaultApi,
      token: "",
      status: "offline",
      messages: [],
      calls: [],
      expandedId: null,
      setApiUrl: (apiUrl) => set({ apiUrl: apiUrl.replace(/\/$/, "") }),
      setToken: (token) => set({ token }),
      setStatus: (status) => set({ status }),
      setMessages: (messages) => set({ messages }),
      setCalls: (calls) => set({ calls }),
      addMessage: (message) =>
        set((state) => ({
          messages: [message, ...state.messages.filter((m) => m.id !== message.id)],
        })),
      addCall: (call) =>
        set((state) => ({
          calls: [call, ...state.calls.filter((c) => c.id !== call.id)],
        })),
      setExpandedId: (expandedId) => set({ expandedId }),
    }),
    {
      name: "device-bridge-settings",
      partialize: (state) => ({
        apiUrl: state.apiUrl,
        token: state.token,
        messages: state.messages,
        calls: state.calls,
      }),
    },
  ),
);
