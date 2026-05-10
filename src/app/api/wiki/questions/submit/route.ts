// app/api/wiki/questions/submit/route.ts — 成員出題 endpoint
//
// Phase: 2 (Forge — 新建)
// Spec  : phase2 spec D-1 / D-15 / D-16 / D-17
// ADR   : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §C.1
//
// 邏輯：
//   1. raw body → HMAC verify（QUESTIONS_AGENT_HMAC_SECRET，與 wiki action 分離 §E.2）
//   2. body schema 驗證（owner / questions[] 結構）
//   3. D-1：questions.length >= 2（< 2 reject + hint 走 Telegram）
//   4. D-15：每題 options 2~5 個
//   5. D-16：answer_note 由老大寫 — 此處不檢
//   6. D-17：必填 question_body / options / impact_summary / owner / created_at
//   7. dry-run 攔截（X-Lens-DryRun + X-Lens-Reason，沿用 Phase 1 慣例）
//   8. 一個迴圈內 INSERT 全部 question（libSQL HTTP 不支援 cross-statement transaction
//      with rollback，但每筆 INSERT 內部是 atomic）
//   9. 寫 chat_messages 出題錨點（D-14）— 失敗不 abort，回 partial_success

import { NextRequest, NextResponse } from "next/server";

import {
  webappQuestions,
  stringifyQuestionOptions,
  QUESTION_OPTIONS_MIN,
  QUESTION_OPTIONS_MAX,
  QUESTION_BODY_MAX_LENGTH,
  IMPACT_SUMMARY_MAX_LENGTH,
  HYPOTHESIS_MAX_LENGTH,
  OPTION_KEY_MAX_LENGTH,
  OPTION_LABEL_MAX_LENGTH,
  type QuestionOption,
} from "@/lib/db/schema-questions";
import { db } from "@/lib/turso";
import { verifyQuestionsAgentSig } from "@/lib/wiki-hmac";
import { isDryRun, dryRunResponse, requireDryRunAudit } from "@/lib/dry-run";
import { isValidParticipant, notifyBossOfNewQuestions } from "@/lib/questions-notify";

export const runtime = "nodejs";

// ============================================================================
// Types
// ============================================================================

interface QuestionInputRaw {
  question_body?: unknown;
  options?: unknown;
  impact_summary?: unknown;
  hypothesis?: unknown;
}

interface SubmitBodyRaw {
  owner?: unknown;
  questions?: unknown;
}

interface ValidatedQuestion {
  questionBody: string;
  options: QuestionOption[];
  impactSummary: string;
  hypothesis: string | null;
}

function jsonError(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...details }, { status });
}

function validateOptions(raw: unknown): QuestionOption[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "options_not_array" };
  if (raw.length < QUESTION_OPTIONS_MIN) return { error: "options_too_few" };
  if (raw.length > QUESTION_OPTIONS_MAX) return { error: "options_too_many" };
  const out: QuestionOption[] = [];
  const seenKeys = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== "object" || item === null) {
      return { error: `option_${i}_not_object` };
    }
    const k = (item as { key?: unknown }).key;
    const l = (item as { label?: unknown }).label;
    if (typeof k !== "string" || k.length === 0) {
      return { error: `option_${i}_key_invalid` };
    }
    if (k.length > OPTION_KEY_MAX_LENGTH) {
      return { error: `option_${i}_key_too_long` };
    }
    if (typeof l !== "string" || l.length === 0) {
      return { error: `option_${i}_label_invalid` };
    }
    if (l.length > OPTION_LABEL_MAX_LENGTH) {
      return { error: `option_${i}_label_too_long` };
    }
    if (seenKeys.has(k)) {
      return { error: `option_${i}_duplicate_key` };
    }
    seenKeys.add(k);
    out.push({ key: k, label: l });
  }
  return out;
}

function validateOneQuestion(
  raw: QuestionInputRaw,
  idx: number,
): ValidatedQuestion | { error: string } {
  // question_body
  const qb = raw.question_body;
  if (typeof qb !== "string" || qb.length === 0) {
    return { error: `q${idx}_question_body_required` };
  }
  if (qb.length > QUESTION_BODY_MAX_LENGTH) {
    return { error: `q${idx}_question_body_too_long` };
  }
  // options
  const opts = validateOptions(raw.options);
  if ("error" in opts) {
    return { error: `q${idx}_${opts.error}` };
  }
  // impact_summary
  const imp = raw.impact_summary;
  if (typeof imp !== "string" || imp.length === 0) {
    return { error: `q${idx}_impact_summary_required` };
  }
  if (imp.length > IMPACT_SUMMARY_MAX_LENGTH) {
    return { error: `q${idx}_impact_summary_too_long` };
  }
  // hypothesis (optional)
  let hyp: string | null = null;
  if (raw.hypothesis !== null && raw.hypothesis !== undefined) {
    if (typeof raw.hypothesis !== "string") {
      return { error: `q${idx}_hypothesis_not_string` };
    }
    if (raw.hypothesis.length > HYPOTHESIS_MAX_LENGTH) {
      return { error: `q${idx}_hypothesis_too_long` };
    }
    if (raw.hypothesis.length > 0) hyp = raw.hypothesis;
  }
  return {
    questionBody: qb,
    options: opts,
    impactSummary: imp,
    hypothesis: hyp,
  };
}

// ============================================================================
// POST handler
// ============================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. raw body for HMAC
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonError(400, "body_read_failed");
  }
  if (Buffer.byteLength(rawBody, "utf8") > 200 * 1024) {
    return jsonError(413, "body_too_large", { max_bytes: 200 * 1024 });
  }

  // 2. HMAC verify (QUESTIONS_AGENT_HMAC_SECRET)
  const sig = req.headers.get("x-agent-hmac");
  if (!verifyQuestionsAgentSig(rawBody, sig)) {
    return jsonError(401, "unauthorized", {
      hint: "X-Agent-HMAC required (use QUESTIONS_AGENT_HMAC_SECRET; not the wiki action one)",
    });
  }

  // 3. parse JSON
  let body: SubmitBodyRaw;
  try {
    body = JSON.parse(rawBody) as SubmitBodyRaw;
  } catch {
    return jsonError(400, "invalid_json");
  }
  if (!body || typeof body !== "object") {
    return jsonError(400, "body_not_object");
  }

  // 4. owner
  if (typeof body.owner !== "string" || body.owner.length === 0) {
    return jsonError(400, "owner_required");
  }
  const owner = body.owner.trim().toLowerCase();
  if (!isValidParticipant(owner)) {
    return jsonError(400, "owner_not_in_whitelist", { owner });
  }

  // 5. questions[]
  if (!Array.isArray(body.questions)) {
    return jsonError(400, "questions_not_array");
  }
  if (body.questions.length === 0) {
    return jsonError(400, "questions_empty");
  }
  // D-1：< 2 reject 帶 hint
  if (body.questions.length < 2) {
    return jsonError(400, "questions_too_few", {
      hint: "至少 2 題才走 webapp (D-1)；< 2 題或純 yes/no 請走 Telegram",
      received_count: body.questions.length,
    });
  }
  if (body.questions.length > 50) {
    return jsonError(400, "questions_too_many", {
      hint: "單一批次上限 50 題（避免一次轟炸老大）",
    });
  }

  // 6. validate each question
  const validated: ValidatedQuestion[] = [];
  for (let i = 0; i < body.questions.length; i++) {
    const r = validateOneQuestion(body.questions[i] as QuestionInputRaw, i);
    if ("error" in r) {
      return jsonError(400, r.error);
    }
    validated.push(r);
  }

  // 7. dry-run 攔截（沿用 Phase 1 慣例）
  if (isDryRun(req)) {
    const audit = requireDryRunAudit(req);
    if (!audit.ok) return jsonError(400, audit.error, { hint: audit.hint });
    return dryRunResponse({
      would_insert: validated.length,
      owner,
      preview: validated.map((q, i) => ({
        idx: i,
        question_body: q.questionBody.slice(0, 80),
        options_count: q.options.length,
        impact_summary_len: q.impactSummary.length,
      })),
    });
  }

  // 8. INSERT 全部 question
  const now = new Date().toISOString();
  const insertedIds: number[] = [];
  try {
    for (const q of validated) {
      const r = await db
        .insert(webappQuestions)
        .values({
          owner,
          questionBody: q.questionBody,
          options: stringifyQuestionOptions(q.options),
          impactSummary: q.impactSummary,
          hypothesis: q.hypothesis,
          createdAt: now,
        })
        .returning({ id: webappQuestions.id });
      if (!r || r.length === 0 || typeof r[0].id !== "number") {
        throw new Error("insert returned no id");
      }
      insertedIds.push(r[0].id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 部分 INSERT 成功狀態：libSQL HTTP 沒有 transaction rollback；告知 caller
    return jsonError(500, "db_insert_failed", {
      detail: msg,
      partial_inserted_ids: insertedIds,
      hint: "部分題目可能已寫入；secretary 排查並決定是否重試剩餘題目。",
    });
  }

  // 9. 半寫錨點 1：owner → boss chat_messages（D-14）
  const previewItems = validated.map((q, i) => ({
    id: insertedIds[i],
    questionBody: q.questionBody,
  }));
  let chatOk = false;
  let chatReason: string | undefined;
  try {
    const r = await notifyBossOfNewQuestions({
      owner,
      questionIds: insertedIds,
      questionPreviews: previewItems,
    });
    chatOk = r.ok;
    if (!r.ok) chatReason = r.reason;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    chatReason = `threw: ${msg}`;
  }
  if (!chatOk) {
    console.error(
      `[questions/submit] notifyBossOfNewQuestions failed: ${chatReason ?? "unknown"} (questions inserted but boss not notified)`,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      question_ids: insertedIds,
      chat_anchor_written: chatOk,
      ...(chatOk ? {} : { chat_anchor_reason: chatReason }),
      url: `${getBaseUrl()}/wiki/questions`,
    },
    { status: 201 },
  );
}

function getBaseUrl(): string {
  const explicit = process.env.MEMORY_WEBAPP_BASE_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.length > 0) return `https://${vercel}`;
  return "http://localhost:3000";
}

