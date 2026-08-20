export type ConnectionStatus = "connecting" | "connected" | "offline";

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  synced: boolean;
}

export interface CallEvent {
  id: string;
  caller: string;
  state: "RINGING" | "OFFHOOK" | "IDLE" | string;
  timestamp: string;
  duration: number;
  synced?: boolean;
}

export interface Paginated<T> {
  status: string;
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
