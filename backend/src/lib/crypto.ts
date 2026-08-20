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
