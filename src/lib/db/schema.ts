// schema.ts — Drizzle ORM schema for Memory Webapp Phase 1 (Turso)
//
// Spec source : reports/architecture/memory-webapp-architecture-v2-20260509.md §C.3 / §D.2
// Migration   : scripts/db/migrations/turso-001-*.sql + turso-002-*.sql
// Author      : Vault (2026-05-09)
//
// 依賴（Forge 啟用此檔前需 npm install）：
//   - drizzle-orm
//   - @libsql/client
//
// 注意：
//   1. CHECK constraints / triggers 全部在 SQL migration 層強制（structure over discipline），
//      Drizzle schema 只是 TypeScript 型別 + runtime CRUD 介面，不重複宣告 CHECK。
//   2. 七個 action_type / 三個 decision_layer / 11 個 status 用 TS literal union
//      暴露給 application，與 SQL CHECK 雙端對齊（任一端漂移要修兩端）。
//   3. 時戳統一 INTEGER ms epoch（Date.now()）；libSQL 不像 PostgreSQL 有 timestamp 型別。
//   4. payload_* 欄位上限 100KB（v2 §A.1），由 SQL CHECK 強制；application 層
//      也建議在 endpoint 端先檢查，避免大 payload 跑到 DB 才被拒造成浪費。

import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

// ============================================================================
// Enum literals — 與 SQL CHECK constraints 雙端對齊
// ============================================================================

/**
 * v2 §D.2 鎖死的 action_type 白名單。
 *
 * Phase 1.2 (turso-003 LIVE 2026-05-10): 加 'rollback'（白名單由 7 → 8）。
 * rollback 是補償動作 row：worker 撈到後從 backup_path 還原檔案，完成後把
 * 原 war 由 'rolled_back' 升 'superseded_by_rollback'。詳見 v2 §F.2 / §G.3。
 */
export const ACTION_TYPES = [
  "create_page",
  "modify_content",
  "delete_page",
  "mark_stale",
  "merge_pages",
  "split_page",
  "adjust_tags",
  "rollback",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** 三層模型 */
export const DECISION_LAYERS = ["auto", "notify", "review"] as const;
export type DecisionLayer = (typeof DECISION_LAYERS)[number];

/** 八成員 + secretary + boss */
export const OWNERS = [
  "lego",
  "sherlock",
  "vault",
  "forge",
  "lens",
  "grant",
  "mika",
  "yuki",
  "waffles",
  "secretary",
  "boss",
] as const;
export type Owner = (typeof OWNERS)[number];

/** 發起來源 */
export const INITIATED_BY = ["agent", "boss", "cron", "migration"] as const;
export type InitiatedBy = (typeof INITIATED_BY)[number];

/**
 * v2 §D.2 完整 status 白名單。State machine（合法轉換見 SQL trigger T10）：
 *   auto_pending      → worker_picked / auto_applied / applied_failed / rollback_failed
 *   pending_review    → approved / rejected
 *   approved          → worker_picked / applied / applied_failed / rollback_failed
 *   worker_picked     → auto_applied / applied / applied_pending_ack / applied_failed / rollback_failed
 *   applied_pending_ack → ack / rolled_back
 *   applied / auto_applied → rolled_back
 *   rolled_back       → superseded_by_rollback   (Phase 1.2 turso-003 新增)
 *   ack / rejected / superseded_by_rollback / applied_failed / rollback_failed → 終態
 *
 * Phase 1.2 (turso-003 LIVE 2026-05-10): 加 'rollback_failed' + 'superseded_by_rollback'
 *   - rollback_failed：rollback action row 自身在 worker 階段失敗（必填 worker_error，T7 守）
 *   - superseded_by_rollback：原 war 在補償 rollback action 完成後，由 'rolled_back' 升此終態
 *     （T10 合法轉換 rolled_back → superseded_by_rollback）
 */
export const ACTION_STATUSES = [
  "auto_pending",
  "auto_applied",
  "pending_review",
  "approved",
  "worker_picked",
  "applied",
  "applied_pending_ack",
  "ack",
  "rejected",
  "rolled_back",
  "applied_failed",
  "rollback_failed",
  "superseded_by_rollback",
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** Token issuer */
export const TOKEN_ISSUERS = ["secretary", "system"] as const;
export type TokenIssuer = (typeof TOKEN_ISSUERS)[number];

/** Token subject — Phase 1 只有 boss */
export const TOKEN_SUBJECTS = ["boss"] as const;
export type TokenSubject = (typeof TOKEN_SUBJECTS)[number];

/** Rolled-back by */
export const ROLLBACK_AGENTS = ["boss", "secretary"] as const;
export type RollbackAgent = (typeof ROLLBACK_AGENTS)[number];

// ============================================================================
// Table: wiki_action_requests
// SQL: scripts/db/migrations/turso-001-create-wiki-action-requests.sql
// ============================================================================
export const wikiActionRequests = sqliteTable(
  "wiki_action_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    actionType: text("action_type", { enum: ACTION_TYPES }).notNull(),

    decisionLayer: text("decision_layer", {
      enum: DECISION_LAYERS,
    }).notNull(),

    targetPage: text("target_page").notNull(),

    /** JSON array of paths (merge/split 時的連動頁面)；可為 null */
    relatedPages: text("related_pages"),

    /**
     * Phase 1.2 (turso-003 LIVE 2026-05-10) 新欄。
     * rollback action row 必填，指向被回滾的原 war_id（self-FK）；非 rollback action
     * 必須 NULL。SQL trigger T11/T12 在 INSERT 時雙端守門（不靠 application 自律）。
     */
    relatedWarId: integer("related_war_id"),

    owner: text("owner", { enum: OWNERS }).notNull(),

    initiatedBy: text("initiated_by", { enum: INITIATED_BY })
      .notNull()
      .default("agent"),

    /** 變更前內容；可為 null（create_page 時無前值） */
    payloadOld: text("payload_old"),

    /** 變更後內容；必填 */
    payloadNew: text("payload_new").notNull(),

    /** Phase 1 不用，留 schema 給 Phase 3 edit-and-approve 機制 */
    payloadEdited: text("payload_edited"),

    /** 三欄白話文（告知/要問層必填，自主層可空） */
    whatChanged: text("what_changed"),
    whyChanged: text("why_changed"),
    impactScope: text("impact_scope"),

    /** 要問層必填（SQL trigger T4 強制） */
    justification: text("justification"),

    /** 要問層 reject 必填（SQL trigger T8 強制） */
    rejectReason: text("reject_reason"),

    status: text("status", { enum: ACTION_STATUSES }).notNull(),

    /**
     * 雙鎖備份絕對路徑：C:\\MySecretary\\wiki\\.backups\\<timestamp>\\<file>
     * SQL trigger T6 強制：status 進 *applied* 系列前必填
     */
    backupPath: text("backup_path"),

    /** worker 失敗時的錯誤訊息（SQL trigger T7 強制 status=applied_failed 必填） */
    workerError: text("worker_error"),

    // Timestamps (ms epoch)
    createdAt: integer("created_at").notNull(),
    decidedAt: integer("decided_at"),
    workerPickedAt: integer("worker_picked_at"),
    workerCompletedAt: integer("worker_completed_at"),

    // Rollback
    rolledBackAt: integer("rolled_back_at"),
    rolledBackBy: text("rolled_back_by", { enum: ROLLBACK_AGENTS }),
    rollbackReason: text("rollback_reason"),
  },
  (table) => ({
    // 索引名稱與 SQL migration 一致，方便 Drizzle 不會重建
    idxWorkerPending: index("idx_war_worker_pending").on(
      table.status,
      table.createdAt,
    ),
    idxBossPending: index("idx_war_boss_pending").on(
      table.status,
      table.createdAt,
    ),
    idxOwner: index("idx_war_owner").on(table.owner, table.createdAt),
    idxTargetPage: index("idx_war_target_page").on(
      table.targetPage,
      table.createdAt,
    ),
  }),
);

export type WikiActionRequest = typeof wikiActionRequests.$inferSelect;
export type NewWikiActionRequest = typeof wikiActionRequests.$inferInsert;

// ============================================================================
// Table: wiki_tokens
// SQL: scripts/db/migrations/turso-002-create-wiki-tokens.sql
// ============================================================================
export const wikiTokens = sqliteTable(
  "wiki_tokens",
  {
    /** ULID (26 chars) 或 UUID v4 (36 chars)，application 層自由選 */
    id: text("id").primaryKey(),

    issuedAt: integer("issued_at").notNull(),
    expiresAt: integer("expires_at").notNull(),

    issuedBy: text("issued_by", { enum: TOKEN_ISSUERS })
      .notNull()
      .default("secretary"),

    subject: text("subject", { enum: TOKEN_SUBJECTS })
      .notNull()
      .default("boss"),

    lastUsedAt: integer("last_used_at"),
    useCount: integer("use_count").notNull().default(0),

    revokedAt: integer("revoked_at"),
    revokeReason: text("revoke_reason"),

    note: text("note"),
  },
  (table) => ({
    /**
     * Active token 主查詢索引（v2 §E.4 push 時抓最新 active）。
     * 注意：Drizzle sqlite-core 目前不支援 partial index 的 WHERE clause；
     * SQL migration 層已建為 `WHERE revoked_at IS NULL` 的 partial index。
     * 這裡只宣告非 partial 版本給 Drizzle 型別，實際執行用 SQL 層的 partial。
     */
    idxActive: index("idx_tokens_active").on(table.expiresAt, table.issuedAt),
    idxIssued: index("idx_tokens_issued").on(table.issuedAt),
  }),
);

export type WikiToken = typeof wikiTokens.$inferSelect;
export type NewWikiToken = typeof wikiTokens.$inferInsert;

// ============================================================================
// Helper: payload size limit constant
// ============================================================================
/** v2 §A.1 100KB payload size limit。Application endpoint 應在 schema CHECK 之前先驗 */
export const PAYLOAD_MAX_BYTES = 102400;

/**
 * 三欄白話文上限。v2 §A.2 取消「最少 20 字」規則，但仍有上限避免灌爆。
 * SQL CHECK: BETWEEN 1 AND 4096
 */
export const NARRATIVE_MAX_LENGTH = 4096;
