// lib/wiki-auth.ts — Wiki page-side auth（雙路徑：mfo_admin OR wiki_admin_token）
//
// Phase: 1g (P1-14 by Forge — 新建)
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §C.5
//              + 秘書長 Phase 1g Q1 cookie 語意設計
//
// 設計取捨（重要 — Forge 主動標出反饋秘書長）：
//
//   v2 §C.5 鐵律：「絕對不要把這套 token 機制擴張到非 wiki 範圍 — scope creep
//   會把這個 token 變成 root credential」。
//
//   秘書長派工原文是「verifyAdminCookie 改為雙路徑」，但 verifyAdminCookie 同時
//   保護 /api/layout、/api/assets、/api/conv-settings 等非 wiki endpoint。如果改全域
//   verifyAdminCookie，那 wiki magic link token 就能寫所有 admin 寫入，違反 §C.5。
//
//   → 折衷：新建 verifyWikiAccess (本檔)，「只給 wiki page-side endpoint 用」。
//      mfo_admin / wiki_admin_token 雙路徑接受。
//      layout/assets/conv-settings 仍用 verifyAdminCookie（單一路徑），不變。
//
//   Capability matrix（明確劃分）：
//      mfo_admin (admin password)         → root credential，所有 admin endpoint
//      wiki_admin_token (magic link)      → 只能讀寫 wiki action endpoints
//        - 接受：GET /wiki, GET /wiki/[id], POST /api/wiki/decide
//        - 不接受：POST /api/wiki/token/issue (root only — 不能自己延期自己)
//        - 不接受：POST /api/wiki/token/revoke (root only — 不能自己撤自己)
//        - 不接受：POST /api/wiki/submit（HMAC server-to-server，不走 cookie）
//        - 不接受：/api/layout、/api/assets、/api/conv-settings (非 wiki 範圍)
//
// Token verify 流程：
//   1. cookie 拿到 wiki_admin_token value（= token string）
//   2. verifyTokenSig (lib/wiki-hmac.ts) — sig + exp 驗證
//   3. DB lookup wiki_tokens WHERE id=tid AND revoked_at IS NULL AND expires_at > now
//   4. 任一步 fail → 此路徑 fail（fallback 到 mfo_admin 路徑）
//
// Use count 不在 verify 時 +1 — 因為 page render / decide POST 都會打過 verify，
// 一次「使用 token」可能觸發多次 verify。use_count + 1 只在 magic link 入口
// (/api/wiki/auth-magic) 處理，符合「每次點 ?t= URL 算 1 次使用」的語意。

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { verifyAdminCookie } from "@/lib/admin-auth";
import { verifyTokenSig } from "@/lib/wiki-hmac";
import { wikiTokens } from "@/lib/db/schema";
import { db } from "@/lib/turso";

/** wiki magic-link cookie 名稱 */
export const WIKI_TOKEN_COOKIE = "wiki_admin_token";

/**
 * 驗 wiki_admin_token cookie 完整性：
 *   - sig 通過
 *   - exp 未過
 *   - DB row 存在 + revoked_at IS NULL + expires_at > now（雙保險）
 */
async function verifyWikiTokenCookie(
  req: NextRequest,
): Promise<boolean> {
  const c = req.cookies.get(WIKI_TOKEN_COOKIE);
  const tokenStr = c?.value;
  if (!tokenStr) return false;

  // 1. Sig + exp（stateless）
  const sigCheck = verifyTokenSig(tokenStr);
  if (!sigCheck.valid) return false;

  // 2. DB lookup — revoke check 必走
  try {
    const rows = await db
      .select({
        id: wikiTokens.id,
        revokedAt: wikiTokens.revokedAt,
        expiresAt: wikiTokens.expiresAt,
      })
      .from(wikiTokens)
      .where(eq(wikiTokens.id, sigCheck.payload.tid))
      .limit(1);
    if (rows.length === 0) return false;
    const row = rows[0];
    if (row.revokedAt !== null) return false;
    if (row.expiresAt < Date.now()) return false;
    return true;
  } catch {
    // DB 故障時不放行（fail-closed）
    return false;
  }
}

/**
 * 驗 wiki page-side 存取：mfo_admin OR wiki_admin_token 雙路徑接受。
 *
 * mfo_admin 路徑 (admin password 簽發) — 同步驗證，不查 DB
 * wiki_admin_token 路徑 (magic link) — 異步，要查 wiki_tokens DB（revoke check）
 *
 * 任一路徑通過 → 放行。兩條都失敗才回 false。
 */
export async function verifyWikiAccess(req: NextRequest): Promise<boolean> {
  // 路徑 A：mfo_admin（既有 admin password cookie；同步快路徑優先）
  if (verifyAdminCookie(req)) return true;
  // 路徑 B：wiki_admin_token（magic link cookie；DB lookup）
  if (await verifyWikiTokenCookie(req)) return true;
  return false;
}
