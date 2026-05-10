// app/api/wiki/questions/answer/route.ts — 老大答題 endpoint
//
// Phase: 2 (Forge — 新建)
// Spec  : phase2 spec D-4 / D-5 / D-16
// ADR   : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §C.2
//
// 邏輯：
//   1. Auth：verifyWikiAccess（admin cookie OR wiki_admin_token；Vault 027 落地後升 capability='questions'）
//   2. body: { question_id: number, answered_option: string, answer_note?: string }
//   3. 查 row → 確認 answered_at IS NULL（未答）
//   4. 驗 answered_option ∈ options.keys
//   5. 驗 answer_note ≤ 500
//   6. dry-run 攔截
//   7. 條件式 UPDATE: WHERE id=? AND answered_at IS NULL（防 TOCTOU 兩個老大同時答）
//   8. 不寫 chat_messages（D-14 過程不寫；polling endpoint 才寫錨點 2）
//   9. 不指派 batch_id（cron-batch-close 自動 close）

import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import {
  webappQuestions,
  parseQuestionOptions,
  ANSWER_NOTE_MAX_LENGTH,
} from "@/lib/db/schema-questions";
import { db } from "@/lib/turso";
import { verifyAdminCookie } from "@/lib/admin-auth";
import { verifyTokenCapability } from "@/lib/token-capability";
import { WIKI_TOKEN_COOKIE } from "@/lib/wiki-auth";
import { isDryRun, dryRunResponse, requireDryRunAudit } from "@/lib/dry-run";

export const runtime = "nodejs";

interface AnswerBody {
  question_id?: unknown;
  answered_option?: unknown;
  answer_note?: unknown;
}

function jsonError(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...details }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Auth — Vault turso-005 已落地（capability column LIVE）
  //    雙路徑：admin password (root) 或 wiki_admin_token w/ capability='questions'
  if (!verifyAdminCookie(req)) {
    const tokenStr = req.cookies.get(WIKI_TOKEN_COOKIE)?.value;
    const cap = await verifyTokenCapability(tokenStr, "questions");
    if (!cap.ok) {
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
        hint: "answer endpoint requires admin cookie or wiki_admin_token with capability=questions",
      });
    }
  }

  // 2. Parse body
  let body: AnswerBody;
  try {
    body = (await req.json()) as AnswerBody;
  } catch {
    return jsonError(400, "invalid_json");
  }
  if (!body || typeof body !== "object") {
    return jsonError(400, "body_not_object");
  }

  const qid = body.question_id;
  if (typeof qid !== "number" || !Number.isInteger(qid) || qid <= 0) {
    return jsonError(400, "question_id_invalid");
  }

  const answeredOption = body.answered_option;
  if (typeof answeredOption !== "string" || answeredOption.length === 0) {
    return jsonError(400, "answered_option_required");
  }

  let answerNote: string | null = null;
  if (body.answer_note !== undefined && body.answer_note !== null) {
    if (typeof body.answer_note !== "string") {
      return jsonError(400, "answer_note_not_string");
    }
    if (body.answer_note.length > ANSWER_NOTE_MAX_LENGTH) {
      return jsonError(400, "answer_note_too_long", {
        max_chars: ANSWER_NOTE_MAX_LENGTH,
      });
    }
    if (body.answer_note.length > 0) answerNote = body.answer_note;
  }

  // 3. Lookup row
  const rows = await db
    .select()
    .from(webappQuestions)
    .where(eq(webappQuestions.id, qid))
    .limit(1);
  if (rows.length === 0) {
    return jsonError(404, "question_not_found", { question_id: qid });
  }
  const current = rows[0];
  if (current.answeredAt !== null) {
    return jsonError(409, "question_already_answered", {
      question_id: qid,
      answered_at: current.answeredAt,
    });
  }

  // 4. answered_option ∈ options.keys
  const opts = parseQuestionOptions(current.options) ?? [];
  if (opts.length === 0) {
    return jsonError(500, "options_corrupted", {
      hint: "DB 裡 options JSON 壞了，secretary 介入查 row",
    });
  }
  const validKey = opts.find((o) => o.key === answeredOption);
  if (!validKey) {
    return jsonError(400, "answered_option_not_in_options", {
      answered_option: answeredOption,
      valid_keys: opts.map((o) => o.key),
    });
  }

  // 5. dry-run 攔截
  if (isDryRun(req)) {
    const audit = requireDryRunAudit(req);
    if (!audit.ok) return jsonError(400, audit.error, { hint: audit.hint });
    return dryRunResponse({
      would_update: true,
      question_id: qid,
      answered_option: answeredOption,
      has_note: answerNote !== null,
    });
  }

  // 6. 條件式 UPDATE
  const now = new Date().toISOString();
  let affected: number;
  try {
    const r = await db
      .update(webappQuestions)
      .set({
        answeredOption,
        answerNote,
        answeredAt: now,
      })
      .where(
        and(
          eq(webappQuestions.id, qid),
          isNull(webappQuestions.answeredAt),
        ),
      )
      .returning({ id: webappQuestions.id });
    affected = r.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(500, "db_update_failed", { detail: msg });
  }

  if (affected === 0) {
    return jsonError(409, "answer_race_condition", {
      hint: "其他人已先答了這題（TOCTOU race），請刷新頁面",
    });
  }

  return NextResponse.json(
    {
      ok: true,
      question_id: qid,
      answered_at: now,
      answered_option: answeredOption,
    },
    { status: 200 },
  );
}
