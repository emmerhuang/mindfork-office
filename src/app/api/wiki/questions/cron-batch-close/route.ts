// app/api/wiki/questions/cron-batch-close/route.ts — Vercel Cron 自動 close batch
//
// Phase: 2 (Forge — 新建)
// Spec  : phase2 spec D-10
// ADR   : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §C.5 / §D.3
//
// Vercel Cron 觸發此 endpoint（GET，每 5 分鐘），跑 closeStaleBatches：
//   - 找出 answered_at < (NOW - QUESTIONS_BATCH_CLOSE_MIN minutes) 且 batch_id IS NULL 的 row
//   - 按 owner 分組，各打一個新 batch_id
//
// Auth：Vercel Cron 自動帶 `Authorization: Bearer <CRON_SECRET>`，env `CRON_SECRET` 配對驗證。
//       本機跑：直接帶 X-Cron-Secret header 配 env CRON_SECRET。
//
// 時間參數：env QUESTIONS_BATCH_CLOSE_MIN（預設 10）

import { NextRequest, NextResponse } from "next/server";

import { closeStaleBatches, generateSimpleBatchId } from "@/lib/questions-data";

export const runtime = "nodejs";

function jsonError(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...details }, { status });
}

function verifyCronAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) {
    // Dev mode 不設 CRON_SECRET → 允許（與既有 dry-run dev fallback 同模式）
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }
  // Vercel Cron 帶 Authorization: Bearer <secret>
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;
  // 本機 driver 帶 X-Cron-Secret
  const xc = req.headers.get("x-cron-secret");
  if (xc === expected) return true;
  return false;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return jsonError(401, "unauthorized");
  }

  const closeMinRaw = process.env.QUESTIONS_BATCH_CLOSE_MIN;
  let closeMin = 10;
  if (closeMinRaw && /^\d+$/.test(closeMinRaw)) {
    const v = parseInt(closeMinRaw, 10);
    if (v >= 1 && v <= 1440) closeMin = v;
  }

  let results;
  try {
    results = await closeStaleBatches({
      closeAfterMinutes: closeMin,
      generateBatchId: generateSimpleBatchId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such table/i.test(msg)) {
      return jsonError(503, "questions_table_missing");
    }
    return jsonError(500, "db_query_failed", { detail: msg });
  }

  const totalClosed = results.reduce((s, r) => s + r.count, 0);
  return NextResponse.json(
    {
      ok: true,
      close_after_minutes: closeMin,
      batches_closed: results.length,
      total_questions_closed: totalClosed,
      details: results,
    },
    { status: 200 },
  );
}
