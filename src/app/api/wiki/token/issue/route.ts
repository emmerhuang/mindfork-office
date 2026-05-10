// app/api/wiki/token/issue/route.ts — 簽發 magic link token
//
// Phase: 1e (P1-9 by Forge — 實作)
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §C.4
// Lens P1-A 修：route 從 src/app/wiki/api/token/issue 移到 src/app/api/wiki/token/issue
//
// 邏輯：
//   1. verify admin cookie（重用 admin-auth.ts verifyAdminCookie；token issue 必須有
//      比 token 更強的 auth — 不然就遞迴。admin password 是 root credential）
//   2. parse body { note? }（可選的備註，例如 '老大 5/9 21:30 重發'）
//   3. 產 token id（randomUUID 36 chars，schema CHECK length BETWEEN 16 AND 64 通過）
//   4. INSERT wiki_tokens row（issued_at, expires_at = now+24h, issued_by='secretary',
//      subject='boss', use_count=0）
//   5. signToken({ tid, iss, exp, sub: 'boss' }) 用 lib/wiki-hmac.ts
//   6. return { token, url, token_id, expires_at }
//      url = `${BASE}/wiki?t=<token>` （BASE 從 env 或 default 產 prod URL）
//
// dry-run 支援：跑完所有 validation，不真 INSERT；回傳 { dry_run, would_insert, preview }

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { wikiTokens } from "@/lib/db/schema";
import { db } from "@/lib/turso";
import { verifyAdminCookie } from "@/lib/admin-auth";
import { signToken, type TokenPayload } from "@/lib/wiki-hmac";
import { isDryRun, dryRunResponse, requireDryRunAudit } from "@/lib/dry-run";

export const runtime = "nodejs";

// 24 hours TTL（v2 §C.1）
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

interface IssueBody {
  note?: unknown;
}

function jsonError(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...details }, { status });
}

function getBaseUrl(): string {
  // 優先：明確設定 → Vercel 預設 URL → localhost
  const explicit = process.env.MEMORY_WEBAPP_BASE_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.length > 0) return `https://${vercel}`;
  return "http://localhost:3000";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ----- 1. Auth: admin cookie required -----
  if (!verifyAdminCookie(req)) {
    return jsonError(401, "unauthorized", {
      hint: "token issue requires admin cookie (admin password is root credential)",
    });
  }

  // ----- 2. Parse body (optional note) -----
  let body: IssueBody = {};
  try {
    const text = await req.text();
    if (text && text.length > 0) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        body = parsed as IssueBody;
      }
    }
  } catch {
    return jsonError(400, "invalid_json");
  }

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") {
      return jsonError(400, "note_not_string");
    }
    if (body.note.length === 0) {
      note = null;
    } else if (body.note.length > 512) {
      // schema CHECK: length BETWEEN 1 AND 512
      return jsonError(400, "note_too_long", { max_chars: 512 });
    } else {
      note = body.note;
    }
  }

  // ----- 3. Generate token id + timestamps -----
  // randomUUID 36 chars，schema CHECK length BETWEEN 16 AND 64 通過
  const tokenId = crypto.randomUUID();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TOKEN_TTL_MS;

  // ----- 4. dry-run 攔截（必須有 audit reason — P3-NEW Lens 1d）-----
  if (isDryRun(req)) {
    const auditCheck = requireDryRunAudit(req);
    if (!auditCheck.ok) {
      return jsonError(400, auditCheck.error, { hint: auditCheck.hint });
    }
    return dryRunResponse({
      would_insert: true,
      preview: {
        token_id: tokenId,
        issued_at: issuedAt,
        expires_at: expiresAt,
        issued_by: "secretary",
        subject: "boss",
        note,
      },
    });
  }

  // ----- 5. INSERT wiki_tokens -----
  try {
    await db.insert(wikiTokens).values({
      id: tokenId,
      issuedAt,
      expiresAt,
      issuedBy: "secretary",
      subject: "boss",
      useCount: 0,
      note,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(500, "db_insert_failed", { detail: msg });
  }

  // ----- 6. Sign token -----
  const payload: TokenPayload = {
    tid: tokenId,
    iss: issuedAt,
    exp: expiresAt,
    sub: "boss",
  };
  const token = signToken(payload);
  const url = `${getBaseUrl()}/wiki?t=${encodeURIComponent(token)}`;

  return NextResponse.json(
    {
      token,
      url,
      token_id: tokenId,
      issued_at: issuedAt,
      expires_at: expiresAt,
    },
    { status: 201 },
  );
}
