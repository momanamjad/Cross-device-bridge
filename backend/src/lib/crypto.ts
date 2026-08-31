import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function generateApiToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensEqual(a: string, b: string): boolean {
  const ha = Buffer.from(hashToken(a), "hex");
  const hb = Buffer.from(hashToken(b), "hex");
  if (ha.length !== hb.length) return false;
  return timingSafeEqual(ha, hb);
}

export function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

import { createCipheriv, createDecipheriv, pbkdf2Sync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const ITERATIONS = 100000;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;

export function deriveKey(secret: string, salt: Buffer): Buffer {
  return pbkdf2Sync(secret, salt, ITERATIONS, KEY_LEN, "sha256");
}

export function encryptPayload(data: any, secret: string): string {
  const jsonStr = JSON.stringify(data);
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(secret, salt);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(jsonStr, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  
  return `${salt.toString("base64")}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

export function decryptPayload(payloadStr: string, secret: string): any {
  if (typeof payloadStr !== "string") return payloadStr;
  const parts = payloadStr.split(":");
  if (parts.length !== 4) return payloadStr; // not encrypted
  
  const salt = Buffer.from(parts[0], "base64");
  const iv = Buffer.from(parts[1], "base64");
  const authTag = Buffer.from(parts[2], "base64");
  const ciphertext = parts[3];
  
  const key = deriveKey(secret, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  
  return JSON.parse(decrypted);
}
