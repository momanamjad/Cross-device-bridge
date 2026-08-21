import fs from "fs";
import path from "path";
import { env } from "./environment";

// Export the Prisma replacement types
export interface Device {
  id: string;
  externalId: string;
  deviceName: string;
  deviceType: string;
  osVersion: string;
  tokenHash: string;
  isActive: boolean;
  lastSeen: Date;
  createdAt: Date;
}

export interface Message {
  id: string;
  deviceId: string;
  sender: string;
  content: string;
  timestamp: Date;
  synced: boolean;
  syncedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CallNotification {
  id: string;
  deviceId: string;
  caller: string;
  callState: string;
  timestamp: Date;
  duration: number;
  synced: boolean;
  syncedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Call {
  id: string;
  initiator_device: string;
  initiator_number?: string | null;
  receiver_number?: string | null;
  state: string;
  is_incoming: boolean;
  started_at: Date;
  ended_at?: Date | null;
  duration_seconds: number;
  call_sid?: string | null;
  connected_successfully: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface IceCandidate {
  id: string;
  call_id: string;
  candidate: string;
  sdp_mid?: string | null;
  sdp_mline_index?: number | null;
  from_device: string;
  created_at: Date;
}

// Define the database JSON schema types
interface DeviceRecord {
  id: string;
  externalId: string;
  deviceName: string;
  deviceType: string;
  osVersion: string;
  tokenHash: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MessageRecord {
  id: string;
  deviceId: string;
  sender: string;
  content: string;
  timestamp: string;
  synced: boolean;
  syncedAt?: string;
  createdAt: string;
}

interface CallNotificationRecord {
  id: string;
  deviceId: string;
  caller: string;
  callState: string;
  timestamp: string;
  duration: number;
  synced: boolean;
  syncedAt?: string;
  createdAt: string;
}

interface CallRecord {
  id: string;
  initiator_device: string;
  initiator_number?: string | null;
  receiver_number?: string | null;
  state: string;
  is_incoming: boolean;
  started_at: string;
  ended_at?: string | null;
  duration_seconds: number;
  call_sid?: string | null;
  connected_successfully: boolean;
  created_at: string;
  updated_at: string;
}

interface IceCandidateRecord {
  id: string;
  call_id: string;
  candidate: string;
  sdp_mid?: string | null;
  sdp_mline_index?: number | null;
  from_device: string;
  created_at: string;
}

interface DbData {
  devices: DeviceRecord[];
  messages: MessageRecord[];
  callNotifications: CallNotificationRecord[];
  calls: CallRecord[];
  iceCandidates: IceCandidateRecord[];
}

// Find path for database file.
let dbPath = path.join(process.cwd(), "device_bridge.json");
if (env.databaseUrl) {
  // Extract path from "file:/..." or similar
  const cleanUrl = env.databaseUrl.replace(/^file:/, "");
  // Replace extension .db with .json
  dbPath = cleanUrl.replace(/\.db$/, ".json");
}

// Ensure the directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Helper to read and write database
function readDb(): DbData {
  if (!fs.existsSync(dbPath)) {
    return { devices: [], messages: [], callNotifications: [], calls: [], iceCandidates: [] };
  }
  try {
    const content = fs.readFileSync(dbPath, "utf8");
    const parsed = JSON.parse(content);
    return {
      devices: parsed.devices || [],
      messages: parsed.messages || [],
      callNotifications: parsed.callNotifications || [],
      calls: parsed.calls || [],
      iceCandidates: parsed.iceCandidates || []
    };
  } catch (e) {
    return { devices: [], messages: [], callNotifications: [], calls: [], iceCandidates: [] };
  }
}

function writeDb(data: DbData) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
}

// Custom ID generator (simple random string)
function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// Helper maps
function mapDevice(d: DeviceRecord): Device {
  return {
    ...d,
    lastSeen: new Date(d.updatedAt),
    createdAt: new Date(d.createdAt)
  };
}

function mapMessage(m: MessageRecord): Message {
  return {
    ...m,
    timestamp: new Date(m.timestamp),
    createdAt: new Date(m.createdAt),
    updatedAt: new Date(m.createdAt),
    syncedAt: m.syncedAt ? new Date(m.syncedAt) : null
  };
}

function mapCallNotification(c: CallNotificationRecord): CallNotification {
  return {
    ...c,
    timestamp: new Date(c.timestamp),
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.createdAt),
    syncedAt: c.syncedAt ? new Date(c.syncedAt) : null
  };
}

function mapCall(c: CallRecord): Call {
  return {
    ...c,
    started_at: new Date(c.started_at),
    ended_at: c.ended_at ? new Date(c.ended_at) : null,
    created_at: new Date(c.created_at),
    updated_at: new Date(c.updated_at)
  };
}

function mapIceCandidate(i: IceCandidateRecord): IceCandidate {
  return {
    ...i,
    created_at: new Date(i.created_at)
  };
}

// Mock Prisma Client interface
class MockPrisma {
  async $disconnect() {
    // No-op
  }

  async $queryRaw(query: any, ...values: any[]) {
    return [1];
  }

  device = {
    async findUnique(args: any) {
      const db = readDb();
      if (args.where?.id) {
        const found = db.devices.find(d => d.id === args.where.id);
        return found ? mapDevice(found) : null;
      }
      if (args.where?.externalId) {
        const found = db.devices.find(d => d.externalId === args.where.externalId);
        return found ? mapDevice(found) : null;
      }
      return null;
    },

    async findFirst(args: any) {
      const db = readDb();
      if (args.where?.tokenHash) {
        const found = db.devices.find(d => d.tokenHash === args.where.tokenHash && (args.where.isActive === undefined || d.isActive === args.where.isActive));
        return found ? mapDevice(found) : null;
      }
      return null;
    },

    async upsert(args: any) {
      const db = readDb();
      let index = db.devices.findIndex(d => d.externalId === args.where.externalId);
      const now = new Date().toISOString();
      let record: DeviceRecord;

      if (index !== -1) {
        record = {
          ...db.devices[index],
          ...args.update,
          updatedAt: now
        };
        db.devices[index] = record;
      } else {
        record = {
          id: generateId(),
          externalId: args.create.externalId,
          deviceName: args.create.deviceName,
          deviceType: args.create.deviceType,
          osVersion: args.create.osVersion || "",
          tokenHash: args.create.tokenHash,
          isActive: args.create.isActive ?? true,
          createdAt: now,
          updatedAt: now
        };
        db.devices.push(record);
      }
      writeDb(db);
      return mapDevice(record);
    },

    async update(args: any) {
      const db = readDb();
      let index = db.devices.findIndex(d => d.id === args.where.id);
      if (index === -1) return null;
      db.devices[index] = {
        ...db.devices[index],
        ...args.data,
        updatedAt: new Date().toISOString()
      };
      writeDb(db);
      return mapDevice(db.devices[index]);
    }
  };

  message = {
    async create(args: any) {
      const db = readDb();
      const now = new Date().toISOString();
      const record: MessageRecord = {
        id: generateId(),
        deviceId: args.data.deviceId,
        sender: args.data.sender,
        content: args.data.content,
        timestamp: args.data.timestamp.toISOString(),
        synced: args.data.synced ?? false,
        createdAt: now
      };
      db.messages.push(record);
      writeDb(db);
      return mapMessage(record);
    },

    async count(args: any) {
      const db = readDb();
      let list = db.messages;
      if (args.where?.deviceId) {
        list = list.filter(m => m.deviceId === args.where.deviceId);
      }
      if (args.where?.synced !== undefined) {
        list = list.filter(m => m.synced === args.where.synced);
      }
      return list.length;
    },

    async findMany(args: any) {
      const db = readDb();
      let list = db.messages;
      if (args.where?.deviceId) {
        list = list.filter(m => m.deviceId === args.where.deviceId);
      }
      if (args.where?.synced !== undefined) {
        list = list.filter(m => m.synced === args.where.synced);
      }

      if (args.orderBy?.timestamp === "desc") {
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }

      const skip = args.skip ?? 0;
      const take = args.take ?? list.length;
      const sliced = list.slice(skip, skip + take);

      return sliced.map(mapMessage);
    },

    async updateMany(args: any) {
      const db = readDb();
      let count = 0;
      const now = new Date().toISOString();
      db.messages = db.messages.map(m => {
        let match = true;
        if (args.where?.id && m.id !== args.where.id) match = false;
        if (args.where?.deviceId && m.deviceId !== args.where.deviceId) match = false;
        
        if (match) {
          count++;
          return {
            ...m,
            ...args.data,
            syncedAt: args.data.syncedAt ? args.data.syncedAt.toISOString() : now
          };
        }
        return m;
      });
      writeDb(db);
      return { count };
    }
  };

  callNotification = {
    async create(args: any) {
      const db = readDb();
      const now = new Date().toISOString();
      const record: CallNotificationRecord = {
        id: generateId(),
        deviceId: args.data.deviceId,
        caller: args.data.caller,
        callState: args.data.callState,
        timestamp: args.data.timestamp.toISOString(),
        duration: args.data.duration ?? 0,
        synced: args.data.synced ?? false,
        createdAt: now
      };
      db.callNotifications.push(record);
      writeDb(db);
      return mapCallNotification(record);
    },

    async count(args: any) {
      const db = readDb();
      let list = db.callNotifications;
      if (args.where?.deviceId) {
        list = list.filter(c => c.deviceId === args.where.deviceId);
      }
      if (args.where?.synced !== undefined) {
        list = list.filter(c => c.synced === args.where.synced);
      }
      return list.length;
    },

    async findMany(args: any) {
      const db = readDb();
      let list = db.callNotifications;
      if (args.where?.deviceId) {
        list = list.filter(c => c.deviceId === args.where.deviceId);
      }
      if (args.where?.synced !== undefined) {
        list = list.filter(c => c.synced === args.where.synced);
      }

      if (args.orderBy?.timestamp === "desc") {
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }

      const skip = args.skip ?? 0;
      const take = args.take ?? list.length;
      const sliced = list.slice(skip, skip + take);

      return sliced.map(mapCallNotification);
    },

    async updateMany(args: any) {
      const db = readDb();
      let count = 0;
      const now = new Date().toISOString();
      db.callNotifications = db.callNotifications.map(c => {
        let match = true;
        if (args.where?.id && c.id !== args.where.id) match = false;
        if (args.where?.deviceId && c.deviceId !== args.where.deviceId) match = false;

        if (match) {
          count++;
          return {
            ...c,
            ...args.data,
            syncedAt: args.data.syncedAt ? args.data.syncedAt.toISOString() : now
          };
        }
        return c;
      });
      writeDb(db);
      return { count };
    }
  };

  call = {
    async create(args: any) {
      const db = readDb();
      const now = new Date().toISOString();
      const record: CallRecord = {
        id: args.data.id || generateId(),
        initiator_device: args.data.initiator_device,
        initiator_number: args.data.initiator_number || null,
        receiver_number: args.data.receiver_number || null,
        state: args.data.state,
        is_incoming: args.data.is_incoming,
        started_at: args.data.started_at ? args.data.started_at.toISOString() : now,
        ended_at: args.data.ended_at ? args.data.ended_at.toISOString() : null,
        duration_seconds: args.data.duration_seconds ?? 0,
        call_sid: args.data.call_sid || null,
        connected_successfully: args.data.connected_successfully ?? false,
        created_at: now,
        updated_at: now
      };
      db.calls.push(record);
      writeDb(db);
      return mapCall(record);
    },

    async findUnique(args: any) {
      const db = readDb();
      const found = db.calls.find(c => c.id === args.where.id);
      return found ? mapCall(found) : null;
    },

    async findMany(args: any) {
      const db = readDb();
      let list = db.calls;
      if (args.where?.state) {
        list = list.filter(c => c.state === args.where.state);
      }
      if (args.where?.created_at?.gte) {
        list = list.filter(c => new Date(c.created_at).getTime() >= new Date(args.where.created_at.gte).getTime());
      }
      return list.map(mapCall);
    },

    async update(args: any) {
      const db = readDb();
      let index = db.calls.findIndex(c => c.id === args.where.id);
      if (index === -1) return null;
      db.calls[index] = {
        ...db.calls[index],
        ...args.data,
        updated_at: new Date().toISOString()
      };
      writeDb(db);
      return mapCall(db.calls[index]);
    },

    async updateMany(args: any) {
      const db = readDb();
      let count = 0;
      const now = new Date().toISOString();
      db.calls = db.calls.map(c => {
        let match = true;
        if (args.where?.state && c.state !== args.where.state) match = false;
        if (args.where?.initiator_device && c.initiator_device !== args.where.initiator_device) match = false;

        if (match) {
          count++;
          return {
            ...c,
            ...args.data,
            updated_at: now
          };
        }
        return c;
      });
      writeDb(db);
      return { count };
    }
  };

  iceCandidate = {
    async create(args: any) {
      const db = readDb();
      const now = new Date().toISOString();
      const record: IceCandidateRecord = {
        id: generateId(),
        call_id: args.data.call_id,
        candidate: args.data.candidate,
        sdp_mid: args.data.sdp_mid || null,
        sdp_mline_index: args.data.sdp_mline_index !== undefined ? Number(args.data.sdp_mline_index) : null,
        from_device: args.data.from_device,
        created_at: now
      };
      db.iceCandidates.push(record);
      writeDb(db);
      return mapIceCandidate(record);
    }
  };
}

export const prisma = new MockPrisma();
