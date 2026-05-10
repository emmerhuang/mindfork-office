// lib/wiki-auth.ts — Wiki page-side auth（雙路徑：mfo_admin OR wiki_admin_token）
//
// Phase: 1g (P1-14 by Forge — 新建)
// Phase: 2  hotfix (Forge 2026-05-10) — capability scope enforce
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §C.5
//              + Lego ADR §E (capability scope guard)
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
// Phase 2 hotfix (Forge 2026-05-10)：
//
//   原本 verifyWikiAccess 自己跑 sig+revoke check 但**沒驗 capability**。
//   結果 capability='questions' 的 token 也能通過，反向同樣可能。違反 §C.5
//   token scope 切分初衷。
//
//   修補：token 路徑改委派 verifyTokenCapability(token, required)，讓 capability
//   檢查與 questions endpoint 同一 source of truth (lib/token-capability.ts)。
//   呼叫端可指定 required capability（預設 'wiki_action'，wiki action endpoint 用）；
//   questions page 自己呼叫 verifyTokenCapability(..., 'questions')，不走本函式。
//
//   Capability matrix（明確劃分；hotfix 後 enforce）：
//      mfo_admin (admin password)              → root credential，不受 capability 限制
//      wiki_admin_token w/ capability='wiki_action' → /wiki, /wiki/[id], /api/wiki/decide
//      wiki_admin_token w/ capability='questions'   → /wiki/questions/*, /api/wiki/questions/{list,answer}
//      wiki_admin_token (any)                       → 不可打 /api/wiki/token/*, /api/wiki/submit (HMAC), /api/layout/*
//
// Token verify 流程：
//   1. cookie 拿到 wiki_admin_token value（= token string）
//   2. verifyTokenCapability (lib/token-capability.ts)
//      — sig + exp + DB revoke + capability 對齊 required，一次驗完
//   3. 任一步 fail → 此路徑 fail（fallback 到 mfo_admin 路徑）
//
// Use count 不在 verify 時 +1 — 因為 page render / decide POST 都會打過 verify，
// 一次「使用 token」可能觸發多次 verify。use_count + 1 只在 magic link 入口
// (/api/wiki/auth-magic) 處理，符合「每次點 ?t= URL 算 1 次使用」的語意。

import { NextRequest } from "next/server";

import { verifyAdminCookie } from "@/lib/admin-auth";
import { verifyTokenCapability, type Capability } from "@/lib/token-capability";

/** wiki magic-link cookie 名稱 */
export const WIKI_TOKEN_COOKIE = "wiki_admin_token";

/**
 * 驗 wiki page-side / wiki action endpoint 存取：mfo_admin OR wiki_admin_token 雙路徑接受。
 *
 * mfo_admin 路徑 (admin password 簽發)
 *   — 同步驗證，不查 DB，不受 capability 限制（root credential）
 * wiki_admin_token 路徑 (magic link)
 *   — 異步，要查 wiki_tokens DB（revoke check + capability 對齊 required）
 *
 * @param req
 *   Next.js request（page-side 透過 makeServerRequest 包裝 cookies）
 * @param required
 *   token 路徑要求的 capability（預設 'wiki_action'，與 wiki action endpoint 一致）
 *   呼叫 questions page 請傳 'questions'；不要呼本函式而是直接用 verifyTokenCapability。
 *   保留參數是為了 future endpoint 在同一個函式內表達 scope。
 *
 * 任一路徑通過 → 放行。兩條都失敗才回 false。
 */
export async function verifyWikiAccess(
  req: NextRequest,
  required: Capability = "wiki_action",
): Promise<boolean> {
  // 路徑 A：mfo_admin（既有 admin password cookie；同步快路徑優先）
  if (verifyAdminCookie(req)) return true;
  // 路徑 B：wiki_admin_token（magic link cookie；DB lookup + capability 對齊）
  const tokenStr = req.cookies.get(WIKI_TOKEN_COOKIE)?.value;
  const cap = await verifyTokenCapability(tokenStr, required);
  return cap.ok;
}
