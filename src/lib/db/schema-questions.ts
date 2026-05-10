// schema-questions.ts — Drizzle ORM schema for Memory Webapp Phase 2 (提問機制)
//
// Spec source : reports/architecture/memory-webapp-phase2-questions-spec-20260510.md (D-1..D-17)
// ADR         : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §B.1
// Migration   : C:/MySecretary/scripts/db/migrations/turso-004-create-webapp-questions.sql
// Author      : Forge (2026-05-10)
//
// 為什麼獨立檔（不寫進 schema.ts）：
//   - schema.ts 是 Phase 1 wiki action 機制的 Drizzle 介面，與 webapp_questions 沒 FK
//     關聯（Sherlock D-13 拍板新表獨立）
//   - 拆檔讓 Phase 2 import 不會帶到 Phase 1 全部 enum 字面量（雖然 tree-shake 都拿
//     得掉，但人類 review code 時看 import path 一眼知道屬哪個 phase）
//
// 注意：
//   1. CHECK constraints / triggers 全部在 SQL migration 層強制（structure over discipline）
//      Drizzle schema 只是 TS 型別 + runtime CRUD 介面，不重複宣告 CHECK
//   2. options 是 JSON-stringified array，application 層存進去前 JSON.stringify、讀出來
//      JSON.parse；型別上是 text（與 turso-001 wiki_action_requests.related_pages 同模式）
//   3. 時戳統一用 TEXT（ISO 8601），對齊 chat_messages 慣例（與 wiki_action_requests INTEGER ms 不同）
//      理由見 turso-004 migration 註解：webapp_questions 不需要高頻時間運算，TEXT 對 audit 更可讀
//   4. 八成員白名單 owner 由 application 層擋（lib/questions-notify.ts VALID_PARTICIPANTS）；
//      schema CHECK 只驗格式（小寫 + 2~32 chars）

import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

// ============================================================================
// Option 結構（application 層 JSON.parse / stringify）
// ============================================================================

/** 單個選項的形狀 */
export interface QuestionOption {
  /** 選項 key（短代號，如 'a' / 'b' / 'opt_1'，1~32 chars） */
  key: string;
  /** 選項顯示文字（label，老大端按鈕上顯示） */
  label: string;
}

// ============================================================================
// D-15 ~ D-17 常數
// ============================================================================

/** D-15 選項數量上下限 */
export const QUESTION_OPTIONS_MIN = 2;
export const QUESTION_OPTIONS_MAX = 5;

/** D-16 補充說明字數上限 */
export const ANSWER_NOTE_MAX_LENGTH = 500;

/** 題目主體上限（與 SQL CHECK 對齊） */
export const QUESTION_BODY_MAX_LENGTH = 4096;

/** 影響說明上限（與 SQL CHECK 對齊） */
export const IMPACT_SUMMARY_MAX_LENGTH = 2048;

/** Hypothesis 上限（與 SQL CHECK 對齊） */
export const HYPOTHESIS_MAX_LENGTH = 2048;

/** Option key 字元上限 */
export const OPTION_KEY_MAX_LENGTH = 32;

/** Option label 字元上限（自訂，避免單一 button 顯示太長） */
export const OPTION_LABEL_MAX_LENGTH = 200;

// ============================================================================
// Table: webapp_questions
// SQL: scripts/db/migrations/turso-004-create-webapp-questions.sql
// ============================================================================
export const webappQuestions = sqliteTable(
  "webapp_questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** 出題人 member name（小寫，2~32 字元；application 層白名單） */
    owner: text("owner").notNull(),

    /** 題目主體（D-17 必填，1~4096 字元） */
    questionBody: text("question_body").notNull(),

    /** 選項清單 JSON-stringified array of QuestionOption（D-15: 2~5 個） */
    options: text("options").notNull(),

    /** 白話影響說明（D-2/D-5 必填，1~2048 字元；前置展示） */
    impactSummary: text("impact_summary").notNull(),

    /** 出題人建議答案（D-17 選填，可 null） */
    hypothesis: text("hypothesis"),

    /** 老大答的 option key（必須 ∈ options 的 key 之一，由 application 層驗） */
    answeredOption: text("answered_option"),

    /** 老大補充說明（D-16，≤500 字元） */
    answerNote: text("answer_note"),

    /**
     * batch_id：同一輪老大批次答完的 ULID（D-10）。
     * - 老大答題時不主動指派（不增加認知負擔）
     * - 由 Vercel Cron 後填（10min 無新答題 close batch）
     * - polling fallback：batch_id 為 null 也照拉（避免 cron 掛了卡資料）
     */
    batchId: text("batch_id"),

    /** ISO 8601 timestamp（與 chat_messages 一致） */
    createdAt: text("created_at").notNull(),

    /** 老大答題時間 */
    answeredAt: text("answered_at"),

    /** owner polling 拉走時間 */
    deliveredAt: text("delivered_at"),
  },
  (table) => ({
    // Index 名稱與 SQL migration 一致（避免 Drizzle 重建）
    idxPolling: index("idx_questions_polling").on(table.owner, table.answeredAt),
    idxPending: index("idx_questions_pending").on(table.createdAt),
    idxBatch: index("idx_questions_batch").on(table.batchId),
  }),
);

export type WebappQuestion = typeof webappQuestions.$inferSelect;
export type NewWebappQuestion = typeof webappQuestions.$inferInsert;

// ============================================================================
// Helper: parseOptions / stringifyOptions
// ============================================================================

/**
 * 解析 options JSON string → QuestionOption[]
 *
 * 失敗時回 null（caller 自行決定如何處理；不丟錯避免 list query 掉一筆全 row 看不到）
 */
export function parseQuestionOptions(raw: string | null): QuestionOption[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: QuestionOption[] = [];
    for (const item of parsed) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as { key?: unknown }).key !== "string" ||
        typeof (item as { label?: unknown }).label !== "string"
      ) {
        return null;
      }
      const it = item as { key: string; label: string };
      out.push({ key: it.key, label: it.label });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 將 QuestionOption[] 轉為 JSON string（送 INSERT 時用）。
 * Caller 應在呼叫此 fn 前完成 schema validation（key/label 字數上限、option 數量）。
 */
export function stringifyQuestionOptions(opts: QuestionOption[]): string {
  return JSON.stringify(opts);
}

// ============================================================================
// 工單狀態（隱性 — 不存 column，由 answered_at / delivered_at 推導）
// ============================================================================

/**
 * 計算題目當下狀態（隱性 state machine：created → answered → delivered）。
 * 狀態僅 view 用，不存 column；決定 list 頁分組與 polling SQL where clause。
 */
export type QuestionStatus = "pending" | "answered_undelivered" | "delivered";

export function deriveQuestionStatus(q: {
  answeredAt: string | null;
  deliveredAt: string | null;
}): QuestionStatus {
  if (q.deliveredAt) return "delivered";
  if (q.answeredAt) return "answered_undelivered";
  return "pending";
}
