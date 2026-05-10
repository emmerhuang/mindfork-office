// app/api/wiki/auth-magic/route.ts — Magic link landing endpoint
//
// Phase: 1g (P1-14 by Forge — 新建)
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §C §F
//              + 秘書長 Phase 1g 雙路徑設計
//
// 為什麼存在：
//   middleware.ts (Edge runtime) 不能用 Node `crypto` + drizzle libSQL client，
//   只能 routing。token 完整驗證（sig + DB lookup + use_count++）需要 Node runtime
//   + DB 連線，所以 middleware 把 ?t=... 全部 rewrite 到本 endpoint。
//
// 流程（每次老大從 Telegram 點帶 ?t= 的 URL 都會走這條）：
//   1. GET /api/wiki/auth-magic?t=<token>&next=<encoded-orig-path>
//   2. 驗 token sig + exp（lib/wiki-hmac verifyTokenSig）— 不過直接 redirect 到
//      next（去掉 ?t=）顯示「token 無效」由 page 端處理（401 或登入 UI）。
//      → 不在這裡擋是為了讓老大看到友善頁面，不是裸 401 string。
//   3. DB lookup wiki_tokens WHERE id=tid AND revoked_at IS NULL AND expires_at > now
//   4. UPDATE wiki_tokens SET use_count = use_count + 1, last_used_at = now
//      (schema trigger T5 強制 use_count 必須 +1，不可 +N — sql\`use_count + 1\`
//       正是 +1，符合 trigger)
//   5. Set httpOnly cookie wiki_admin_token = <token>
//   6. 302 redirect 到 next（去掉 ?t=）
//
// 安全考量：
//   - 不收 POST，只收 GET（老大從 Telegram 點 URL 就是 GET）。CSRF 不適用，因為
//     這個 endpoint 不執行業務動作，只發 cookie。
//   - 無 admin cookie 也能進（這就是 magic link 的設計目的：boss 沒登入也能用）
//   - 沒 ?t= → 400（防呆 — 別人猜這個 path 直接打過來）
//   - next 必須是相對路徑且只能指向 /wiki* — 防 open redirect
//   - token 失效（sig 壞 / exp 過 / DB revoked / DB row 不存在）一律 redirect 到
//     /wiki?reason=token_invalid，不發 cookie。page 看到沒 cookie 仍走 mfo_admin
//     檢查，沒 cookie 就跳登入 UI。
//
// dry-run 不適用：本 endpoint 沒有「跳過驗證」的概念，且只發 cookie 不寫業務 row
// （wiki_tokens use_count 是 audit trail，不是業務資料）。
//   - 但 Lens 仍可在 staging 拿真 token 測，路徑與 prod 一致。

import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { verifyTokenSig } from "@/lib/wiki-hmac";
import { wikiTokens } from "@/lib/db/schema";
import { db } from "@/lib/turso";
import { WIKI_TOKEN_COOKIE } from "@/lib/wiki-auth";

export const runtime = "nodejs";

/** wiki_admin_token cookie max age（與 token TTL 對齊：24h） */
const COOKIE_MAX_AGE_SEC = 24 * 60 * 60;

/**
 * 驗 next param 安全：必須以 `/wiki` 開頭（含 `/wiki` 自己），且不含 protocol、host
 * 或開頭 `//`（防 open redirect）。
 */
function sanitizeNext(next: string | null): string {
  // 預設回 /wiki list
  if (!next || typeof next !== "string") return "/wiki";
  // 不可有 scheme / authority；不可 // 開頭
  if (/^[a-z][a-z0-9+.-]*:/i.test(next)) return "/wiki";
  if (next.startsWith("//")) return "/wiki";
  // 必須相對 /wiki 子路徑
  if (next === "/wiki" || next.startsWith("/wiki/") || next.startsWith("/wiki?")) {
    return next;
  }
  return "/wiki";
}

/**
 * 組 Set-Cookie header value（httpOnly + Secure 在 prod + SameSite=Lax）。
 * 不能用 Next.js cookies() helper（response.cookies.set 在 redirect 時行為不可
 * 靠），手寫 header value 更穩。
 *
 * 為何 Lax 不 Strict（2026-05-10 老大拍板）：
 *   magic link 從 Telegram in-app browser 點開是 cross-site top-level
 *   navigation，Strict 會擋瀏覽器把 cookie 送回（reload / 重開 tab 場景）。
 *   業界標準（Stripe / Auth0 / Clerk）magic link cookie 都用 Lax。Lax 對
 *   cross-site GET top-nav 送 cookie，仍能擋 cross-site POST CSRF — 符合
 *   magic link 安全模型。
 */
function buildWikiTokenCookie(token: string): string {
  return [
    `${WIKI_TOKEN_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE_SEC}`,
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const tokenStr = searchParams.get("t");
  const next = sanitizeNext(searchParams.get("next"));

  // 沒帶 t — 直接 redirect 到 list（讓 page 端處理「未登入」）
  if (!tokenStr) {
    return NextResponse.redirect(new URL("/wiki", req.url), 302);
  }

  // 1. Sig + exp 驗（stateless）
  const sig = verifyTokenSig(tokenStr);
  if (!sig.valid) {
    // sig 壞或 exp 過：不發 cookie，redirect 到 list（不帶 ?t=）
    const url = new URL("/wiki", req.url);
    url.searchParams.set("reason", `token_${sig.reason}`);
    return NextResponse.redirect(url, 302);
  }

  // 2. DB lookup — revoke check 必走
  let dbOk = false;
  try {
    const rows = await db
      .select({
        id: wikiTokens.id,
        revokedAt: wikiTokens.revokedAt,
        expiresAt: wikiTokens.expiresAt,
      })
      .from(wikiTokens)
      .where(eq(wikiTokens.id, sig.payload.tid))
      .limit(1);
    if (rows.length > 0) {
      const row = rows[0];
      if (row.revokedAt === null && row.expiresAt > Date.now()) {
        dbOk = true;
      }
    }
  } catch (e) {
    // DB 故障 fail-closed
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[auth-magic] DB lookup failed for tid=${sig.payload.tid}: ${msg}`);
  }

  if (!dbOk) {
    const url = new URL("/wiki", req.url);
    url.searchParams.set("reason", "token_revoked_or_unknown");
    return NextResponse.redirect(url, 302);
  }

  // 3. UPDATE use_count + 1, last_used_at = now（schema T5 強制 +1）
  // 用 sql 模板強制 +1 而非 +N，符合 trigger
  const now = Date.now();
  try {
    await db
      .update(wikiTokens)
      .set({
        useCount: sql`${wikiTokens.useCount} + 1`,
        lastUsedAt: now,
      })
      .where(eq(wikiTokens.id, sig.payload.tid));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // use_count update 失敗不擋使用者（cookie 還是發，audit trail 缺一筆無妨），但要 log
    console.error(`[auth-magic] use_count++ failed for tid=${sig.payload.tid}: ${msg}`);
  }

  // 4. Set cookie + redirect to next
  const res = NextResponse.redirect(new URL(next, req.url), 302);
  res.headers.append("Set-Cookie", buildWikiTokenCookie(tokenStr));
  return res;
}
