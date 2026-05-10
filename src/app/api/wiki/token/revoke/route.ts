// app/api/wiki/token/revoke/route.ts — 撤銷 magic link token
//
// Phase: 1e (P1-9 by Forge — 實作)
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §C.5
// Lens P1-A 修：route 從 src/app/wiki/api/token/revoke 移到 src/app/api/wiki/token/revoke
//
// 邏輯：
//   1. verify admin cookie
//   2. parse body { token_id, revoke_reason }
//      revoke_reason 必填（schema trigger T3 兜底 + endpoint 預擋）
//   3. lookup wiki_tokens by token_id；若不存在 → 404
//      若 revoked_at IS NOT NULL → 409（schema trigger T2 set-once 兜底）
//   4. UPDATE wiki_tokens SET revoked_at=now, revoke_reason=?
//   5. return { ok: true, token_id, revoked_at }
//
// 安全考量：token 外洩時必要。24h 過期等於不負責任。

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { wikiTokens } from "@/lib/db/schema";
import { db } from "@/lib/turso";
import { verifyAdminCookie } from "@/lib/admin-auth";
import { isDryRun, dryRunResponse, requireDryRunAudit } from "@/lib/dry-run";

export const runtime = "nodejs";

interface RevokeBody {
  token_id?: unknown;
  revoke_reason?: unknown;
}

function jsonError(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...details }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ----- 1. Auth -----
  if (!verifyAdminCookie(req)) {
    return jsonError(401, "unauthorized", {
      hint: "token revoke requires admin cookie",
    });
  }

  // ----- 2. Parse body -----
  let body: RevokeBody;
  try {
    body = (await req.json()) as RevokeBody;
  } catch {
    return jsonError(400, "invalid_json");
  }
  if (!body || typeof body !== "object") {
    return jsonError(400, "body_not_object");
  }

  const tokenId = body.token_id;
  if (typeof tokenId !== "string" || tokenId.length === 0 || tokenId.length > 64) {
    return jsonError(400, "token_id_invalid", {
      hint: "token_id must be string, length 1-64",
    });
  }

  const revokeReason = body.revoke_reason;
  if (
    typeof revokeReason !== "string" ||
    revokeReason.length === 0 ||
    revokeReason.length > 512
  ) {
    return jsonError(400, "revoke_reason_required", {
      hint: "non-empty string, <= 512 chars (schema T3 強制必填)",
    });
  }

  // ----- 3. Lookup -----
  const rows = await db
    .select()
    .from(wikiTokens)
    .where(eq(wikiTokens.id, tokenId))
    .limit(1);
  if (rows.length === 0) {
    return jsonError(404, "token_not_found", { token_id: tokenId });
  }
  const current = rows[0];

  if (current.revokedAt !== null) {
    return jsonError(409, "already_revoked", {
      token_id: tokenId,
      revoked_at: current.revokedAt,
      hint: "T2 set-once：revoked_at 寫一次後不可改",
    });
  }

  // ----- 4. dry-run 攔截 -----
  if (isDryRun(req)) {
    const auditCheck = requireDryRunAudit(req);
    if (!auditCheck.ok) {
      return jsonError(400, auditCheck.error, { hint: auditCheck.hint });
    }
    return dryRunResponse({
      would_update: true,
      token_id: tokenId,
      from_revoked: false,
      to_revoked: true,
      revoke_reason: revokeReason,
    });
  }

  // ----- 5. UPDATE -----
  const now = Date.now();
  try {
    await db
      .update(wikiTokens)
      .set({
        revokedAt: now,
        revokeReason: revokeReason,
      })
      .where(eq(wikiTokens.id, tokenId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(500, "db_update_failed", { detail: msg });
  }

  return NextResponse.json(
    {
      ok: true,
      token_id: tokenId,
      revoked_at: now,
    },
    { status: 200 },
  );
}
