"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncContacts = syncContacts;
exports.getContacts = getContacts;
exports.resolveContactName = resolveContactName;
exports.resolveContact = resolveContact;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const CONTACTS_FILE_PATH = path.join(process.cwd(), "contacts.json");
function normalizePhoneNumber(phone) {
    return phone.replace(/[^\d+]/g, "");
}
let contactsCache = new Map();
function loadContactsFromFile() {
    try {
        if (fs.existsSync(CONTACTS_FILE_PATH)) {
            const rawData = fs.readFileSync(CONTACTS_FILE_PATH, "utf-8");
            const list = JSON.parse(rawData);
            contactsCache.clear();
            for (const item of list) {
                contactsCache.set(normalizePhoneNumber(item.phone), item.name);
            }
        }
    }
    catch (err) {
        console.error("Failed to load contacts file:", err);
    }
}
loadContactsFromFile();
async function syncContacts(req, res, next) {
    try {
        const list = req.body;
        if (!Array.isArray(list)) {
            res.status(400).json({ error: "Invalid body format, array expected" });
            return;
        }
        fs.writeFileSync(CONTACTS_FILE_PATH, JSON.stringify(list, null, 2), "utf-8");
        contactsCache.clear();
        for (const item of list) {
            contactsCache.set(normalizePhoneNumber(item.phone), item.name);
        }
        res.status(200).json({ status: "success", count: list.length });
    }
    catch (err) {
        next(err);
    }
}
async function getContacts(req, res, next) {
    try {
        if (fs.existsSync(CONTACTS_FILE_PATH)) {
            const rawData = fs.readFileSync(CONTACTS_FILE_PATH, "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.status(200).send(rawData);
        }
        else {
            res.status(200).json([]);
        }
    }
    catch (err) {
        next(err);
    }
}
function resolveContactName(phone) {
    const norm = normalizePhoneNumber(phone);
    if (contactsCache.has(norm)) {
        return contactsCache.get(norm);
    }
    const suffixLen = 10;
    if (norm.length >= suffixLen) {
        const suffix = norm.substring(norm.length - suffixLen);
        for (const [key, value] of contactsCache.entries()) {
            if (key.endsWith(suffix)) {
                return value;
            }
        }
    }
    return phone;
}
async function resolveContact(req, res, next) {
    try {
        const phone = req.query.phone;
        if (!phone) {
            res.status(400).json({ error: "Missing phone query parameter" });
            return;
        }
        const name = resolveContactName(phone);
        res.status(200).json({ phone, name });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=contactsController.js.map