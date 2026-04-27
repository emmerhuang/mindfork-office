// admin-auth.ts — Server-side admin password auth + signed cookie token
//
// Flow:
//   POST /api/admin-auth { password } → if match ADMIN_PASSWORD env, set httpOnly
//   cookie `mfo_admin` containing HMAC-signed token. Other write endpoints
//   (/api/layout, /api/conv-settings, /api/assets) call `verifyAdminCookie(req)`
//   to authorize.
//
// Why not store password on client: previously the admin password was
// hardcoded into React components and shipped in /_next/static/chunks/*.js,
// exposing it to any visitor. Lens P0.

import { NextRequest } from "next/server";
import crypto from "crypto";

const COOKIE_NAME = "mfo_admin";
// 8 hours — admin sessions are short, layout edits are bursts
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

function getSecret(): string {
  // ADMIN_AUTH_SECRET should be set in Vercel env. Fallback to a dev value
  // ONLY if running locally (NODE_ENV !== "production"); in prod with no
  // secret we throw to surface the misconfiguration loudly.
  const s = process.env.ADMIN_AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "production") {
    return "dev-admin-secret-do-not-use-in-prod";
  }
  throw new Error("ADMIN_AUTH_SECRET not configured");
}

function getAdminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  return p && p.length > 0 ? p : null;
}

/** Constant-time string compare to avoid timing attacks. */
function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // still do a compare to keep timing closer to the equal-length path
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/** True if the given password matches ADMIN_PASSWORD env (constant-time). */
export function verifyPassword(input: string): boolean {
  const expected = getAdminPassword();
  if (!expected) return false;
  if (typeof input !== "string" || input.length === 0) return false;
  return timingSafeEq(input, expected);
}

/** Build an HMAC-signed token: `<expiresAt>.<sigHex>` */
export function issueToken(now: number = Date.now()): string {
  const expiresAt = now + TOKEN_TTL_MS;
  const payload = String(expiresAt);
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

/** Verify token signature + expiry. */
export function verifyToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

/** Read + verify the admin cookie from a request. */
export function verifyAdminCookie(req: NextRequest): boolean {
  const c = req.cookies.get(COOKIE_NAME);
  return verifyToken(c?.value);
}

/** Build a Set-Cookie header value for the admin token. */
export function buildAdminCookie(token: string): string {
  const maxAge = Math.floor(TOKEN_TTL_MS / 1000);
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Strict",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** Expire the cookie. */
export function buildAdminCookieClear(): string {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Strict",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
