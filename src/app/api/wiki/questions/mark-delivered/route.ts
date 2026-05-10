// app/api/wiki/questions/mark-delivered/route.ts — 成員確認拿到答覆，標 delivered_at + 寫錨點 2
//
// Phase: 2 (Forge — 新建)
// Spec  : phase2 spec D-14 半寫錨點 2
// ADR   : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §C.3 / §H.1
//
// 邏輯：
//   1. HMAC verify (QUESTIONS_AGENT_HMAC_SECRET)
//   2. body: { owner: string, question_ids: number[] }
//   3. UPDATE delivered_at = now WHERE owner=? AND id IN (...) AND delivered_at IS NULL
//      （條件式 UPDATE：防重放、防錯主領別人的）
//   4. 撈剛標完的 row → group by batch → format summary
//   5. 寫 chat_messages 錨點 2（boss → owner 答覆摘要 + 答覆字串 D-12）
//   6. 半寫一致性策略（ADR §H.1）：UPDATE 已 commit，chat_messages 失敗只 log
//   7. dry-run 攔截

import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import {
  webappQuestions,
} from "@/lib/db/schema-questions";
import { db } from "@/lib/turso";
import { verifyQuestionsAgentSig } from "@/lib/wiki-hmac";
import { isDryRun, dryRunResponse, requireDryRunAudit } from "@/lib/dry-run";
import {
  groupByBatch,
  type QuestionDetail,
  type AnswerBatch,
} from "@/lib/questions-data";
import {
  isValidParticipant,
  notifyOwnerOfAnswers,
} from "@/lib/questions-notify";
import { parseQuestionOptions, deriveQuestionStatus } from "@/lib/db/schema-questions";

export const runtime = "nodejs";

interface MarkBody {
  owner?: unknown;
  question_ids?: unknown;
}

function jsonError(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...details }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonError(400, "body_read_failed");
  }
  if (Buffer.byteLength(rawBody, "utf8") > 16 * 1024) {
    return jsonError(413, "body_too_large", { max_bytes: 16 * 1024 });
  }

  const sig = req.headers.get("x-agent-hmac");
  if (!verifyQuestionsAgentSig(rawBody, sig)) {
    return jsonError(401, "unauthorized");
  }

  let body: MarkBody;
  try {
    body = JSON.parse(rawBody) as MarkBody;
  } catch {
    return jsonError(400, "invalid_json");
  }

  if (typeof body.owner !== "string" || body.owner.length === 0) {
    return jsonError(400, "owner_required");
  }
  const owner = body.owner.trim().toLowerCase();
  if (!isValidParticipant(owner)) {
    return jsonError(400, "owner_not_in_whitelist", { owner });
  }

  if (!Array.isArray(body.question_ids)) {
    return jsonError(400, "question_ids_not_array");
  }
  const ids: number[] = [];
  for (const v of body.question_ids) {
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
      return jsonError(400, "question_ids_invalid_item");
    }
    ids.push(v);
  }
  if (ids.length === 0) {
    return jsonError(400, "question_ids_empty");
  }
  if (ids.length > 200) {
    return jsonError(400, "question_ids_too_many", { max: 200 });
  }

  if (isDryRun(req)) {
    const audit = requireDryRunAudit(req);
    if (!audit.ok) return jsonError(400, audit.error, { hint: audit.hint });
    return dryRunResponse({
      would_mark_delivered: ids.length,
      owner,
    });
  }

  // 1. UPDATE delivered_at + RETURNING rows（同步拿到剛標完的 row 內容）
  const now = new Date().toISOString();
  let updatedRows: typeof webappQuestions.$inferSelect[];
  try {
    updatedRows = await db
      .update(webappQuestions)
      .set({ deliveredAt: now })
      .where(
        and(
          eq(webappQuestions.owner, owner),
          isNotNull(webappQuestions.answeredAt),
          // delivered_at IS NULL（防重放）
          sql`${webappQuestions.deliveredAt} IS NULL`,
          inArray(webappQuestions.id, ids),
        ),
      )
      .returning();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such table/i.test(msg)) {
      return jsonError(503, "questions_table_missing");
    }
    return jsonError(500, "db_update_failed", { detail: msg });
  }

  if (updatedRows.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        marked: 0,
        chat_anchor_written: false,
        hint: "no questions matched (already delivered or wrong owner)",
      },
      { status: 200 },
    );
  }

  // 2. Build batches from updated rows（rowToDetail 邏輯 inline）
  const details: QuestionDetail[] = updatedRows.map((r) => {
    const opts = parseQuestionOptions(r.options) ?? [];
    return {
      id: r.id,
      owner: r.owner,
      questionBody: r.questionBody,
      options: opts,
      impactSummary: r.impactSummary,
      hypothesis: r.hypothesis,
      answeredOption: r.answeredOption,
      answerNote: r.answerNote,
      batchId: r.batchId,
      status: deriveQuestionStatus({
        answeredAt: r.answeredAt,
        deliveredAt: r.deliveredAt,
      }),
      createdAt: r.createdAt,
      answeredAt: r.answeredAt,
      deliveredAt: r.deliveredAt,
    };
  });
  const batches: AnswerBatch[] = groupByBatch(details);

  // 3. 半寫錨點 2: boss → owner chat_messages
  let chatOk = false;
  let chatReason: string | undefined;
  try {
    const r = await notifyOwnerOfAnswers({ owner, batches });
    chatOk = r.ok;
    if (!r.ok) chatReason = r.reason;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    chatReason = `threw: ${msg}`;
  }
  if (!chatOk) {
    console.error(
      `[questions/mark-delivered] notifyOwnerOfAnswers failed for owner=${owner} ` +
        `marked=${updatedRows.length}: ${chatReason ?? "unknown"} ` +
        `(delivered_at already committed; chat anchor missed - 接受 trade-off)`,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      marked: updatedRows.length,
      question_ids: updatedRows.map((r) => r.id),
      chat_anchor_written: chatOk,
      ...(chatOk ? {} : { chat_anchor_reason: chatReason }),
      batches_count: batches.length,
    },
    { status: 200 },
  );
}
