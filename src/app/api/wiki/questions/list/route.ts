// app/api/wiki/questions/list/route.ts — 老大端拉題目清單
//
// Phase: 2 (Forge — 新建)
// Spec  : phase2 spec D-4 / D-5
// ADR   : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §C.4
//
// Auth：cookie-based magic link token，capability='questions'（Vault 027 落地後生效）。
//       向後相容：027 未落時，required='questions' 會被 capability fallback reject，
//       此 endpoint 暫時改 mfo_admin OR wiki_admin_token 雙路徑。
//
// Query: ?type=pending|answered|all（default=all）
//
// Response: { pending: [...], recently_answered: [...] }（簡化版 list item）
//
// 此 endpoint 主要由 client component（list/detail 頁）呼叫；server component 直接
// 讀 questions-data.ts 的 listQuestionsForBoss 也可。

import { NextRequest, NextResponse } from "next/server";

import { listQuestionsForBoss } from "@/lib/questions-data";
import { verifyAdminCookie } from "@/lib/admin-auth";
import { verifyTokenCapability } from "@/lib/token-capability";
import { WIKI_TOKEN_COOKIE } from "@/lib/wiki-auth";

export const runtime = "nodejs";

function jsonError(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...details }, { status });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vault turso-005 已落地（capability column LIVE，既有 row 全 backfill='wiki_action'）。
  // Auth 雙路徑（admin password 是 root credential，不受 capability 限制）：
  //   1. mfo_admin cookie (admin password) → 放行（root）
  //   2. wiki_admin_token cookie → 必須 capability='questions' 才放行
  // wiki_action capability 的 token 打到這裡會被 token-capability 拒絕（403）。
  if (!verifyAdminCookie(req)) {
    const tokenStr = req.cookies.get(WIKI_TOKEN_COOKIE)?.value;
    const cap = await verifyTokenCapability(tokenStr, "questions");
    if (!cap.ok) {
      // 401 = 沒有有效 token（沒登入 / 過期 / 撤銷 / 簽錯）
      // 403 = 有有效 token 但 capability scope 不對（wiki_action 打 questions endpoint）
      const isAuthMissing =
        cap.reason === "missing_token" ||
        cap.reason === "token_revoked" ||
        cap.reason === "token_expired" ||
        cap.reason === "token_not_found" ||
        cap.reason.startsWith("bad_token_") ||
        cap.reason === "token_db_error";
      const status = isAuthMissing ? 401 : 403;
      return jsonError(status, isAuthMissing ? "unauthorized" : "capability_mismatch", {
        reason: cap.reason,
        hint: "list endpoint requires admin cookie or wiki_admin_token with capability=questions",
      });
    }
  }

  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") ?? "all").toLowerCase();
  if (!["pending", "answered", "all"].includes(type)) {
    return jsonError(400, "invalid_type", { allowed: ["pending", "answered", "all"] });
  }

  let result;
  try {
    result = await listQuestionsForBoss();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Vault migration 未落地時，webapp_questions 表不存在 → query 直接 throw
    if (/no such table/i.test(msg)) {
      return jsonError(503, "questions_table_missing", {
        hint: "Vault migration turso-004 未在此 Turso DB apply。請等 Vault 完成 schema。",
      });
    }
    return jsonError(500, "db_query_failed", { detail: msg });
  }

  if (type === "pending") {
    return NextResponse.json({ pending: result.pending, recently_answered: [] });
  }
  if (type === "answered") {
    return NextResponse.json({ pending: [], recently_answered: result.recentlyAnswered });
  }
  return NextResponse.json(result);
}
