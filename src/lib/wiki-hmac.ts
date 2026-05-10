// lib/wiki-hmac.ts — HMAC 驗證（subagent → Vercel server-to-server）+ token sign/verify lib
//
// Phase: 1b (P1-3 by Forge — 新建)
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §C.2 §F
//
// 兩種 secret（Lens P1-B 強調分離）：
//   1. WIKI_HMAC_SECRET (alias: MEMORY_TOKEN_SECRET)
//      用途：簽 magic link token（老大進 webapp 用）
//      取用：getTokenSecret()
//   2. MEMORY_AGENT_HMAC_SECRET
//      用途：subagent → /api/wiki/submit server-to-server HMAC
//      取用：getAgentSecret()
//
// 兩個 secret 必須分離，避免單一 secret 外洩造成全面淪陷（v2 §C.5）
//
// Env var fallback（與 .env.example 註解對齊）：
//   getTokenSecret(): WIKI_HMAC_SECRET ?? MEMORY_TOKEN_SECRET
//     （兩個都列在 .env.example，secret rotation 風險：兩個命名都要支援）
//   getAgentSecret(): MEMORY_AGENT_HMAC_SECRET（單一命名，無 alias）

import crypto from "crypto";

// ============================================================================
// Secret readers — 兩個 secret，與 admin-auth.ts 模式對齊
// ============================================================================

function getTokenSecret(): string {
  // Lens P1-B：兩種命名都讀，避免 rotate 一邊另一邊還在用。
  // 真相來源：先讀 WIKI_HMAC_SECRET（.env.example canonical），fallback 才到 MEMORY_TOKEN_SECRET（v2 doc 命名）。
  const s = process.env.WIKI_HMAC_SECRET ?? process.env.MEMORY_TOKEN_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV !== "production") {
    return "dev-wiki-hmac-secret-do-not-use-in-prod-32chars";
  }
  throw new Error(
    "WIKI_HMAC_SECRET (or MEMORY_TOKEN_SECRET alias) not configured or too short (need >=32 chars).",
  );
}

function getAgentSecret(): string {
  const s = process.env.MEMORY_AGENT_HMAC_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV !== "production") {
    return "dev-agent-hmac-secret-do-not-use-in-prod-32chars";
  }
  throw new Error(
    "MEMORY_AGENT_HMAC_SECRET not configured or too short (need >=32 chars).",
  );
}

// ============================================================================
// Server-to-server HMAC（subagent → /api/wiki/submit）
// ============================================================================

/**
 * 計算 body 的 HMAC-SHA256 hex digest（subagent 端用）。
 * subagent prompt 教學用：
 *   const sig = computeAgentSig(JSON.stringify(body));
 *   fetch('/api/wiki/submit', {
 *     headers: { 'X-Agent-HMAC': sig, 'X-Agent-Name': 'lego' },
 *     body: JSON.stringify(body),
 *   });
 */
export function computeAgentSig(rawBody: string): string {
  return crypto
    .createHmac("sha256", getAgentSecret())
    .update(rawBody)
    .digest("hex");
}

/**
 * 驗 subagent 帶來的 HMAC（Vercel server 端用）。
 * 用 timing-safe 比對避免 timing attack。
 */
export function verifyAgentSig(
  rawBody: string,
  providedSig: string | null | undefined,
): boolean {
  if (!providedSig || typeof providedSig !== "string") return false;
  const expected = computeAgentSig(rawBody);
  if (providedSig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedSig, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Magic link token（老大瀏覽器 → /wiki + /api/wiki/decide）
// ============================================================================
//
// 格式：base64url(payloadJSON).base64url(sigBytes)
// payload: { tid, iss, exp, sub: 'boss' }
// sig: HMAC-SHA256(WIKI_HMAC_SECRET, base64url(payloadJSON))
//
// P1-9 才會接 wiki_tokens DB lookup + revoke check；本 lib 提供 sign/verify primitives。

export interface TokenPayload {
  /** Token id（對應 wiki_tokens.id；ULID 或 UUID） */
  tid: string;
  /** Issued at (ms epoch) */
  iss: number;
  /** Expires at (ms epoch) */
  exp: number;
  /** Subject — Phase 1 只有 'boss' */
  sub: "boss";
}

function base64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(s: string): Buffer {
  // 補回 padding
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const normalized =
    s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(normalized, "base64");
}

/** 簽 token — P1-9 token issue endpoint 會用 */
export function signToken(payload: TokenPayload): string {
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64urlEncode(payloadStr);
  const sig = crypto
    .createHmac("sha256", getTokenSecret())
    .update(payloadB64)
    .digest();
  return `${payloadB64}.${base64urlEncode(sig)}`;
}

/** 驗 token sig + exp（不查 DB，DB lookup 由 caller 處理 revoke 檢查） */
export function verifyTokenSig(
  token: string | null | undefined,
): { valid: true; payload: TokenPayload } | { valid: false; reason: string } {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "missing_token" };
  }
  const dot = token.indexOf(".");
  if (dot <= 0) {
    return { valid: false, reason: "malformed_token" };
  }
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  // 1. 驗 sig
  const expectedSig = crypto
    .createHmac("sha256", getTokenSecret())
    .update(payloadB64)
    .digest();
  let providedSig: Buffer;
  try {
    providedSig = base64urlDecode(sigB64);
  } catch {
    return { valid: false, reason: "malformed_sig" };
  }
  if (providedSig.length !== expectedSig.length) {
    return { valid: false, reason: "bad_sig" };
  }
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) {
    return { valid: false, reason: "bad_sig" };
  }

  // 2. 解 payload
  let payload: TokenPayload;
  try {
    const payloadJson = base64urlDecode(payloadB64).toString("utf8");
    payload = JSON.parse(payloadJson);
  } catch {
    return { valid: false, reason: "malformed_payload" };
  }

  // 3. 驗結構
  if (
    typeof payload.tid !== "string" ||
    typeof payload.iss !== "number" ||
    typeof payload.exp !== "number" ||
    payload.sub !== "boss"
  ) {
    return { valid: false, reason: "bad_payload_shape" };
  }

  // 4. 驗 exp
  if (payload.exp < Date.now()) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, payload };
}
