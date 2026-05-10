// questions-data.ts — Data access layer for Memory Webapp Phase 2 提問機制
//
// Phase: 2 (Forge — 新建)
// Spec  : reports/architecture/memory-webapp-phase2-questions-spec-20260510.md
// ADR   : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §B / §C
//
// 與 memory-data.ts 拆檔的理由：
//   - 模組邊界對齊 schema-questions.ts（同 phase 一組）
//   - server component / client 都能 import type，但只能 server 呼叫 query function
//
// ⚠ list*/getById/poll* fn 只能在 server component 或 route handler 呼叫；
//   不可在 'use client' component 直接 import — 會把 drizzle/libsql 帶進 bundle 爆掉。

import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import {
  webappQuestions,
  parseQuestionOptions,
  deriveQuestionStatus,
  type QuestionOption,
  type QuestionStatus,
} from "@/lib/db/schema-questions";
import { db } from "@/lib/turso";

// ============================================================================
// View models（給 list / detail 頁用）
// ============================================================================

/** List item — 不需 answer_note 全文，省頻寬 */
export interface QuestionListItem {
  id: number;
  owner: string;
  questionBody: string;
  options: QuestionOption[];
  impactSummary: string;
  hypothesis: string | null;
  answeredOption: string | null;
  status: QuestionStatus;
  createdAt: string;
  answeredAt: string | null;
}

/** Detail — 詳情頁 / 答覆顯示需要全文 */
export interface QuestionDetail extends QuestionListItem {
  answerNote: string | null;
  batchId: string | null;
  deliveredAt: string | null;
}

/** Polling 回傳：批次群組 */
export interface AnswerBatch {
  /** null 代表 cron 未來得及 close 的 ad-hoc batch（fallback group） */
  batchId: string | null;
  /** 該 batch 最早的 answered_at（用以排序 batch 顯示順序） */
  firstAnsweredAt: string;
  questions: QuestionDetail[];
}

// ============================================================================
// Row → ViewModel
// ============================================================================

type QuestionRow = typeof webappQuestions.$inferSelect;

function rowToDetail(r: QuestionRow): QuestionDetail {
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
}

function rowToListItem(r: QuestionRow): QuestionListItem {
  const d = rowToDetail(r);
  // 拋掉 answer_note / deliveredAt / batchId 等較大欄位
  return {
    id: d.id,
    owner: d.owner,
    questionBody: d.questionBody,
    options: d.options,
    impactSummary: d.impactSummary,
    hypothesis: d.hypothesis,
    answeredOption: d.answeredOption,
    status: d.status,
    createdAt: d.createdAt,
    answeredAt: d.answeredAt,
  };
}

// ============================================================================
// Queries — 老大端
// ============================================================================

/**
 * 老大 /wiki/questions list 頁主 query：
 *  - pending（answered_at NULL）：等老大答的
 *  - answered_undelivered + delivered（過去 7 天已答）：給老大回看
 *
 * 排序：pending 按 createdAt ASC（最舊的先答）；已答按 answeredAt DESC。
 */
export async function listQuestionsForBoss(): Promise<{
  pending: QuestionListItem[];
  recentlyAnswered: QuestionListItem[];
}> {
  const pendingRows = await db
    .select()
    .from(webappQuestions)
    .where(isNull(webappQuestions.answeredAt))
    .orderBy(asc(webappQuestions.createdAt))
    .limit(200);

  // 過去 7 天已答（用 ISO 比較 — 字典序與時序一致）
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString();
  const answeredRows = await db
    .select()
    .from(webappQuestions)
    .where(
      and(
        isNotNull(webappQuestions.answeredAt),
        sql`${webappQuestions.answeredAt} >= ${sevenDaysAgo}`,
      ),
    )
    .orderBy(desc(webappQuestions.answeredAt))
    .limit(50);

  return {
    pending: pendingRows.map(rowToListItem),
    recentlyAnswered: answeredRows.map(rowToListItem),
  };
}

/** 詳情頁 query（老大答題用） */
export async function getQuestionById(
  id: string | number,
): Promise<QuestionDetail | null> {
  const numId = typeof id === "number" ? id : Number.parseInt(String(id), 10);
  if (!Number.isFinite(numId) || numId <= 0) return null;
  const rows = await db
    .select()
    .from(webappQuestions)
    .where(eq(webappQuestions.id, numId))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToDetail(rows[0]);
}

// ============================================================================
// Queries — 成員端 polling
// ============================================================================

/**
 * 撈一個 owner 已答未領的批次（按 batch_id 分組）。
 *
 * - SELECT 條件：owner=? AND answered_at IS NOT NULL AND delivered_at IS NULL
 * - 排序：先按 batch_id（NULL 排最後，當 ad-hoc fallback group）、再按 answered_at ASC
 *
 * 不包含 mark delivered_at 動作 — 由 caller 呼叫 markBatchDelivered() 完成（兩動作分離方便 dry-run）
 */
export async function selectUndeliveredForOwner(
  owner: string,
): Promise<QuestionDetail[]> {
  const rows = await db
    .select()
    .from(webappQuestions)
    .where(
      and(
        eq(webappQuestions.owner, owner),
        isNotNull(webappQuestions.answeredAt),
        isNull(webappQuestions.deliveredAt),
      ),
    )
    .orderBy(asc(webappQuestions.answeredAt))
    .limit(200);
  return rows.map(rowToDetail);
}

/** 將 selectUndeliveredForOwner 結果按 batch_id 分組 */
export function groupByBatch(qs: QuestionDetail[]): AnswerBatch[] {
  const map = new Map<string, QuestionDetail[]>();
  for (const q of qs) {
    const key = q.batchId ?? "__null__";
    const arr = map.get(key) ?? [];
    arr.push(q);
    map.set(key, arr);
  }
  const out: AnswerBatch[] = [];
  for (const [key, arr] of map.entries()) {
    const firstAnsweredAt = arr[0]?.answeredAt ?? new Date().toISOString();
    out.push({
      batchId: key === "__null__" ? null : key,
      firstAnsweredAt,
      questions: arr,
    });
  }
  // 排序：null batch（fallback group）排最後；其餘按 firstAnsweredAt ASC
  out.sort((a, b) => {
    if (a.batchId === null && b.batchId !== null) return 1;
    if (a.batchId !== null && b.batchId === null) return -1;
    return a.firstAnsweredAt.localeCompare(b.firstAnsweredAt);
  });
  return out;
}

// ============================================================================
// 批次寫入：mark delivered_at
// ============================================================================

/**
 * 將指定 question_ids 的 delivered_at 一次標記為 now。
 * 條件式 UPDATE 避免重放（只動 delivered_at 還是 null 的）。
 *
 * @returns 實際更新筆數
 */
export async function markDeliveredNow(args: {
  ids: number[];
  owner: string;
}): Promise<number> {
  if (args.ids.length === 0) return 0;
  const now = new Date().toISOString();
  // Drizzle inArray 直接拼 SQL；條件加 owner + delivered_at IS NULL 雙保險
  const rs = await db
    .update(webappQuestions)
    .set({ deliveredAt: now })
    .where(
      and(
        eq(webappQuestions.owner, args.owner),
        isNotNull(webappQuestions.answeredAt),
        isNull(webappQuestions.deliveredAt),
        sql`${webappQuestions.id} IN (${sql.join(
          args.ids.map((i) => sql`${i}`),
          sql`, `,
        )})`,
      ),
    )
    .returning({ id: webappQuestions.id });
  return rs.length;
}

// ============================================================================
// Cron batch close
// ============================================================================

/**
 * 將「答完超過 N 分鐘但 batch_id 仍 null」的 question UPDATE 為新 batch_id（per owner）。
 *
 * @returns 每個 owner 各 close 了幾筆
 */
export async function closeStaleBatches(args: {
  /** 預設 10min；env QUESTIONS_BATCH_CLOSE_MIN 可調 */
  closeAfterMinutes: number;
  /** 由 caller 提供 ULID generator（避免依賴 ulid lib） */
  generateBatchId: () => string;
}): Promise<{ owner: string; batchId: string; count: number }[]> {
  const cutoff = new Date(
    Date.now() - args.closeAfterMinutes * 60 * 1000,
  ).toISOString();
  // 1. 找出每個 owner 有多少 row 待 close
  const rs = await db
    .select({
      id: webappQuestions.id,
      owner: webappQuestions.owner,
    })
    .from(webappQuestions)
    .where(
      and(
        isNotNull(webappQuestions.answeredAt),
        isNull(webappQuestions.batchId),
        sql`${webappQuestions.answeredAt} < ${cutoff}`,
      ),
    );
  if (rs.length === 0) return [];
  // 2. 按 owner 分組 + 各打一個 batchId
  const byOwner = new Map<string, number[]>();
  for (const r of rs) {
    const arr = byOwner.get(r.owner) ?? [];
    arr.push(r.id);
    byOwner.set(r.owner, arr);
  }
  const results: { owner: string; batchId: string; count: number }[] = [];
  for (const [owner, ids] of byOwner.entries()) {
    const batchId = args.generateBatchId();
    const upd = await db
      .update(webappQuestions)
      .set({ batchId })
      .where(
        and(
          eq(webappQuestions.owner, owner),
          isNull(webappQuestions.batchId),
          sql`${webappQuestions.id} IN (${sql.join(
            ids.map((i) => sql`${i}`),
            sql`, `,
          )})`,
        ),
      )
      .returning({ id: webappQuestions.id });
    results.push({ owner, batchId, count: upd.length });
  }
  return results;
}

// ============================================================================
// Pure helpers
// ============================================================================

/** 答覆字串（D-12 塞進通知）：option label + 補充說明摘要 */
export function formatAnswerString(q: QuestionDetail): string {
  const opt = q.options.find((o) => o.key === q.answeredOption);
  const optLabel = opt ? opt.label : q.answeredOption ?? "?";
  const note = q.answerNote ? `（${q.answerNote}）` : "";
  return `${optLabel}${note}`;
}

/** 簡易 ULID-ish ID（不引 ulid lib；timestamp + random hex 即可，唯一性夠用） */
export function generateSimpleBatchId(): string {
  const ts = Date.now().toString(36).padStart(9, "0");
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(36)
    .padStart(7, "0");
  return `b_${ts}_${rand}`;
}
