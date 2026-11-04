import crypto from "node:crypto";
import { AuthRole, AuthSessionPayload } from "./types";
import { normalizeCode } from "./teams";

export const SESSION_COOKIE_NAME = "vfc_session";
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

declare global {
  var __varmbolAuthRateLimit:
    | Map<string, { count: number; resetAt: number }>
    | undefined;
}

function getSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.BLOB_READ_WRITE_TOKEN ||
    "vfc-tactical-engine-secret-2026-katrineholm"
  );
}

export function getSuperAdminCodeDisplay(): string {
  return normalizeCode(process.env.SUPERADMIN_CODE || "LARS2017");
}

export function isSuperAdminCode(rawCode: string): boolean {
  const code = normalizeCode(rawCode);
  if (!code) return false;
  const configured = normalizeCode(process.env.SUPERADMIN_CODE);
  if (configured) {
    return code === configured;
  }
  return code === "LARS2017" || code === "LARS-ADMIN-2017";
}

function hmacSign(data: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");
}

export function createSessionToken(
  role: AuthRole,
  teamId: string | "*"
): string {
  const now = Date.now();
  const payload: AuthSessionPayload = {
    role,
    teamId,
    iat: now,
    exp: now + NINETY_DAYS_SECONDS * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const signature = hmacSign(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(
  token: string | undefined | null
): AuthSessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const expectedSig = hmacSign(payloadB64);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    return null;
  }

  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(json) as AuthSessionPayload;
    if (!payload || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    if (
      payload.role !== "coach" &&
      payload.role !== "follower" &&
      payload.role !== "superadmin"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return null;
}

export function verifyRequestAuth(request: Request): AuthSessionPayload | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    const verified = verifySessionToken(bearerToken);
    if (verified) return verified;
  }

  const customToken = request.headers.get("x-team-token");
  if (customToken) {
    const verified = verifySessionToken(customToken);
    if (verified) return verified;
  }

  const cookieToken = parseCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME
  );
  if (cookieToken) {
    return verifySessionToken(cookieToken);
  }

  return null;
}

export function buildSessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${NINETY_DAYS_SECONDS}${secure}`;
}

export function buildLogoutCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function getRateLimitMap() {
  if (!globalThis.__varmbolAuthRateLimit) {
    globalThis.__varmbolAuthRateLimit = new Map();
  }
  return globalThis.__varmbolAuthRateLimit;
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown-ip";
}

export function isRateLimited(ip: string): boolean {
  const map = getRateLimitMap();
  const entry = map.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    map.delete(ip);
    return false;
  }
  return entry.count >= 12; // Max 12 misslyckade försök per 10 minuter
}

export function recordFailedAttempt(ip: string): void {
  const map = getRateLimitMap();
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const entry = map.get(ip);
  if (!entry || now > entry.resetAt) {
    map.set(ip, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
  }
}

export function clearFailedAttempts(ip: string): void {
  getRateLimitMap().delete(ip);
}
