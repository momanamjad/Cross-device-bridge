"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const environment_1 = require("./environment");
// Find path for database file.
let dbPath = path_1.default.join(process.cwd(), "device_bridge.json");
if (environment_1.env.databaseUrl) {
    // Extract path from "file:/..." or similar
    const cleanUrl = environment_1.env.databaseUrl.replace(/^file:/, "");
    // Replace extension .db with .json
    dbPath = cleanUrl.replace(/\.db$/, ".json");
}
// Ensure the directory exists safely
try {
    const dbDir = path_1.default.dirname(dbPath);
    if (!fs_1.default.existsSync(dbDir)) {
        fs_1.default.mkdirSync(dbDir, { recursive: true });
    }
}
catch (e) {
    console.warn(`[WARN] Could not create db directory: ${e?.message}`);
}
// Helper to read and write database
function readDb() {
    if (!fs_1.default.existsSync(dbPath)) {
        return { devices: [], messages: [], callNotifications: [], calls: [], iceCandidates: [] };
    }
    try {
        const content = fs_1.default.readFileSync(dbPath, "utf8");
        const parsed = JSON.parse(content);
        return {
            devices: parsed.devices || [],
            messages: parsed.messages || [],
            callNotifications: parsed.callNotifications || [],
            calls: parsed.calls || [],
            iceCandidates: parsed.iceCandidates || []
        };
    }
    catch (e) {
        return { devices: [], messages: [], callNotifications: [], calls: [], iceCandidates: [] };
    }
}
function writeDb(data) {
    fs_1.default.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
}
// Custom ID generator (simple random string)
function generateId() {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}
// Helper maps
function mapDevice(d) {
    return {
        ...d,
        lastSeen: new Date(d.updatedAt),
        createdAt: new Date(d.createdAt)
    };
}
function mapMessage(m) {
    return {
        ...m,
        timestamp: new Date(m.timestamp),
        createdAt: new Date(m.createdAt),
        updatedAt: new Date(m.createdAt),
        syncedAt: m.syncedAt ? new Date(m.syncedAt) : null
    };
}
function mapCallNotification(c) {
    return {
        ...c,
        timestamp: new Date(c.timestamp),
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.createdAt),
        syncedAt: c.syncedAt ? new Date(c.syncedAt) : null
    };
}
function mapCall(c) {
    return {
        ...c,
        started_at: new Date(c.started_at),
        ended_at: c.ended_at ? new Date(c.ended_at) : null,
        created_at: new Date(c.created_at),
        updated_at: new Date(c.updated_at)
    };
}
function mapIceCandidate(i) {
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
    async $queryRaw(query, ...values) {
        return [1];
    }
    device = {
        async findUnique(args) {
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
        async findFirst(args) {
            const db = readDb();
            if (args.where?.tokenHash) {
                const found = db.devices.find(d => d.tokenHash === args.where.tokenHash && (args.where.isActive === undefined || d.isActive === args.where.isActive));
                return found ? mapDevice(found) : null;
            }
            return null;
        },
        async upsert(args) {
            const db = readDb();
            let index = db.devices.findIndex(d => d.externalId === args.where.externalId);
            const now = new Date().toISOString();
            let record;
            if (index !== -1) {
                record = {
                    ...db.devices[index],
                    ...args.update,
                    updatedAt: now
                };
                db.devices[index] = record;
            }
            else {
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
        async update(args) {
            const db = readDb();
            let index = db.devices.findIndex(d => d.id === args.where.id);
            if (index === -1)
                return null;
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
        async create(args) {
            const db = readDb();
            const now = new Date().toISOString();
            const record = {
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
        async count(args) {
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
        async findMany(args) {
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
        async updateMany(args) {
            const db = readDb();
            let count = 0;
            const now = new Date().toISOString();
            db.messages = db.messages.map(m => {
                let match = true;
                if (args.where?.id && m.id !== args.where.id)
                    match = false;
                if (args.where?.deviceId && m.deviceId !== args.where.deviceId)
                    match = false;
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
        async create(args) {
            const db = readDb();
            const now = new Date().toISOString();
            const record = {
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
        async count(args) {
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
        async findMany(args) {
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
        async updateMany(args) {
            const db = readDb();
            let count = 0;
            const now = new Date().toISOString();
            db.callNotifications = db.callNotifications.map(c => {
                let match = true;
                if (args.where?.id && c.id !== args.where.id)
                    match = false;
                if (args.where?.deviceId && c.deviceId !== args.where.deviceId)
                    match = false;
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
        async create(args) {
            const db = readDb();
            const now = new Date().toISOString();
            const record = {
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
        async findUnique(args) {
            const db = readDb();
            const found = db.calls.find(c => c.id === args.where.id);
            return found ? mapCall(found) : null;
        },
        async findMany(args) {
            const db = readDb();
            let list = db.calls;
            if (args.where?.state) {
                if (typeof args.where.state === "string") {
                    list = list.filter(c => c.state === args.where.state);
                }
                else if (args.where.state.in && Array.isArray(args.where.state.in)) {
                    list = list.filter(c => args.where.state.in.includes(c.state));
                }
            }
            if (args.where?.created_at?.gte) {
                list = list.filter(c => new Date(c.created_at).getTime() >= new Date(args.where.created_at.gte).getTime());
            }
            if (args.orderBy?.started_at === "desc") {
                list.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
            }
            const take = args.take ?? list.length;
            return list.slice(0, take).map(mapCall);
        },
        async update(args) {
            const db = readDb();
            let index = db.calls.findIndex(c => c.id === args.where.id);
            if (index === -1)
                return null;
            db.calls[index] = {
                ...db.calls[index],
                ...args.data,
                updated_at: new Date().toISOString()
            };
            writeDb(db);
            return mapCall(db.calls[index]);
        },
        async updateMany(args) {
            const db = readDb();
            let count = 0;
            const now = new Date().toISOString();
            db.calls = db.calls.map(c => {
                let match = true;
                if (args.where?.state && c.state !== args.where.state)
                    match = false;
                if (args.where?.initiator_device && c.initiator_device !== args.where.initiator_device)
                    match = false;
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
        async create(args) {
            const db = readDb();
            const now = new Date().toISOString();
            const record = {
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
exports.prisma = new MockPrisma();
