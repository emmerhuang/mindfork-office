// app/api/wiki/questions/poll-answers/route.ts — 成員拉自己的答覆批次
//
// Phase: 2 (Forge — 新建)
// Spec  : phase2 spec D-10 / D-11 / D-12
// ADR   : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §C.3
//
// 邏輯：
//   1. HMAC verify (QUESTIONS_AGENT_HMAC_SECRET)
//   2. body: { owner: string }
//   3. 查 undelivered batches
//   4. **不立即 mark delivered**（拆 endpoint：成員確認拿到後再呼叫 mark-delivered）
//      原因：subagent 拉到後可能 fail-mid-flight；分兩步驟讓 retry 安全
//   5. 寫 chat_messages 錨點 2（boss → owner 答覆摘要） — 標 delivered_at 後才寫
//      但本 endpoint 不寫 delivered_at；改在 mark-delivered endpoint 內 atomic 處理
//      → 因此 poll-answers 「不寫 chat_messages」（避免雙寫不一致）
//   6. dry-run 攔截

import { NextRequest, NextResponse } from "next/server";

import {
  selectUndeliveredForOwner,
  groupByBatch,
  type AnswerBatch,
} from "@/lib/questions-data";
import { verifyQuestionsAgentSig } from "@/lib/wiki-hmac";
import { isDryRun, dryRunResponse, requireDryRunAudit } from "@/lib/dry-run";
import { isValidParticipant } from "@/lib/questions-notify";

export const runtime = "nodejs";

interface PollBody {
  owner?: unknown;
}

function jsonError(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...details }, { status });
}

// 用 POST 走 raw body HMAC 路徑（與 submit 模式一致）；不用 GET 是為了讓 HMAC sign body 包含 owner
export async function POST(req: NextRequest): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonError(400, "body_read_failed");
  }
  if (Buffer.byteLength(rawBody, "utf8") > 8 * 1024) {
    return jsonError(413, "body_too_large", { max_bytes: 8 * 1024 });
  }

  const sig = req.headers.get("x-agent-hmac");
  if (!verifyQuestionsAgentSig(rawBody, sig)) {
    return jsonError(401, "unauthorized");
  }

  let body: PollBody;
  try {
    body = JSON.parse(rawBody) as PollBody;
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

  let batches: AnswerBatch[];
  try {
    const undelivered = await selectUndeliveredForOwner(owner);
    batches = groupByBatch(undelivered);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such table/i.test(msg)) {
      return jsonError(503, "questions_table_missing", {
        hint: "Vault migration turso-004 未在此 Turso DB apply。",
      });
    }
    return jsonError(500, "db_query_failed", { detail: msg });
  }

  if (isDryRun(req)) {
    const audit = requireDryRunAudit(req);
    if (!audit.ok) return jsonError(400, audit.error, { hint: audit.hint });
    return dryRunResponse({
      would_return_batches: batches.length,
      total_questions: batches.reduce((s, b) => s + b.questions.length, 0),
      owner,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      owner,
      batches,
    },
    { status: 200 },
  );
}
