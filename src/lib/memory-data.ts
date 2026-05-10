// memory-data.ts — Data access layer for Memory Webapp Phase 1.
//
// Spec source : reports/architecture/memory-webapp-architecture-v2-20260509.md §F
// Schema ref  : src/lib/db/schema.ts (Vault P1-1)
//
// Phase 1d (P1-6 by Forge)：
//   - 把原 mock 版替換為真 Drizzle query（接 Turso）
//   - 從 schema.ts re-export 字面 union（雙端對齊靠 schema.ts 一份真相）
//   - 新增 listActionRequestsForReview() 給 /wiki list 頁用
//   - getRequestById 改 real query；Yuki 詳情頁不需修改 import path
//
// 本檔仍保留 client/server 通用界面（純資料 + 純函式 computeDiff/statusLabel/getActionsForStatus
// 不依賴 db），server component 直接 await 這些 function；client component 仍可 import type。
//
// ⚠ 純 server-side 的 fn（list*, getRequestById）只能在 server component / route handler
// 呼叫；不可在 "use client" component 直接 import — 會把 drizzle/libsql 帶進 bundle 爆掉。
// 對 client 的型別 import 用 `import type` 即可。

import { and, desc, eq, inArray } from "drizzle-orm";

import {
  wikiActionRequests,
  type ActionType as DbActionType,
  type DecisionLayer as DbDecisionLayer,
  type Owner as DbOwner,
  type ActionStatus as DbActionStatus,
} from "@/lib/db/schema";
import { db } from "@/lib/turso";

// ── Re-export schema types (與 schema.ts 雙端對齊；改名以維持 client component 既有 import) ──
export type ActionType = DbActionType;
export type DecisionLayer = DbDecisionLayer;
export type Owner = DbOwner;
export type ActionStatus = DbActionStatus;

/**
 * 對齊 schema.ts wikiActionRequests，但只挑詳情頁要顯示的欄位。
 * relatedPages 在 DB 裡是 JSON-stringified array (text)；本 interface 解析後給 string[]。
 */
export interface WikiRequestDetail {
  id: number;
  actionType: ActionType;
  decisionLayer: DecisionLayer;
  targetPage: string;
  relatedPages: string[] | null;
  owner: Owner;
  payloadOld: string | null;
  payloadNew: string;
  whatChanged: string | null;
  whyChanged: string | null;
  impactScope: string | null;
  justification: string | null;
  rejectReason: string | null;
  status: ActionStatus;
  backupPath: string | null;
  createdAt: number; // ms epoch
  decidedAt: number | null;
}

/**
 * /wiki list 頁的精簡 row（不需要 payload 全文，省頻寬）。
 */
export interface WikiRequestListItem {
  id: number;
  actionType: ActionType;
  decisionLayer: DecisionLayer;
  targetPage: string;
  owner: Owner;
  whatChanged: string | null;
  whyChanged: string | null;
  impactScope: string | null;
  justification: string | null;
  status: ActionStatus;
  createdAt: number;
}

// ── parsing helper ─────────────────────────────────────────

function parseRelatedPages(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const arr = parsed.filter((p): p is string => typeof p === "string");
    return arr.length > 0 ? arr : null;
  } catch {
    return null;
  }
}

// ── DB queries ─────────────────────────────────────────────

/**
 * Fetch a single wiki_action_request by id.
 *
 * @param id can be string (from URL param) or number; non-numeric string → null.
 */
export async function getRequestById(
  id: string | number,
): Promise<WikiRequestDetail | null> {
  const numId = typeof id === "number" ? id : Number.parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) return null;

  const rows = await db
    .select()
    .from(wikiActionRequests)
    .where(eq(wikiActionRequests.id, numId))
    .limit(1);
  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    id: r.id,
    actionType: r.actionType,
    decisionLayer: r.decisionLayer,
    targetPage: r.targetPage,
    relatedPages: parseRelatedPages(r.relatedPages),
    owner: r.owner,
    payloadOld: r.payloadOld,
    payloadNew: r.payloadNew,
    whatChanged: r.whatChanged,
    whyChanged: r.whyChanged,
    impactScope: r.impactScope,
    justification: r.justification,
    rejectReason: r.rejectReason,
    status: r.status,
    backupPath: r.backupPath,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
  };
}

/**
 * /wiki list 頁主 query：列出需要老大注意的 row。
 *
 * 包含：
 *   - pending_review（要問層 — 等老大批准/拒絕）
 *   - applied_pending_ack（告知層 — 已動完等老大 ack/rollback）
 *   - auto_pending（自主層 — 已排隊等 worker；列出讓老大也看得到、不需操作）
 *
 * 排序：createdAt DESC（最新在上）。
 *
 * 老大 #6414 答 A：告知層也要在 list 看到（雖然不需老大決策、worker 動完後才升 applied_pending_ack）。
 * Phase 1f 加 worker 後，list 會在 auto_pending 上面看到 applied / auto_applied 完成的非終態 row。
 */
const LIST_VISIBLE_STATUSES: ActionStatus[] = [
  "pending_review",
  "applied_pending_ack",
  "auto_pending",
];

export async function listActionRequestsForReview(): Promise<
  WikiRequestListItem[]
> {
  const rows = await db
    .select({
      id: wikiActionRequests.id,
      actionType: wikiActionRequests.actionType,
      decisionLayer: wikiActionRequests.decisionLayer,
      targetPage: wikiActionRequests.targetPage,
      owner: wikiActionRequests.owner,
      whatChanged: wikiActionRequests.whatChanged,
      whyChanged: wikiActionRequests.whyChanged,
      impactScope: wikiActionRequests.impactScope,
      justification: wikiActionRequests.justification,
      status: wikiActionRequests.status,
      createdAt: wikiActionRequests.createdAt,
    })
    .from(wikiActionRequests)
    .where(inArray(wikiActionRequests.status, LIST_VISIBLE_STATUSES))
    .orderBy(desc(wikiActionRequests.createdAt))
    .limit(200); // Phase 1 不分頁；200 row 對 ~few KB / row 約 800KB，可接受
  return rows;
}

/**
 * Phase 1f worker / Phase 1g admin tools 用：依 status 列出。
 * 只允許白名單內的 status，避免 caller 隨意加 status 撈 row。
 */
export async function listByStatuses(
  statuses: ActionStatus[],
): Promise<WikiRequestListItem[]> {
  if (statuses.length === 0) return [];
  const rows = await db
    .select({
      id: wikiActionRequests.id,
      actionType: wikiActionRequests.actionType,
      decisionLayer: wikiActionRequests.decisionLayer,
      targetPage: wikiActionRequests.targetPage,
      owner: wikiActionRequests.owner,
      whatChanged: wikiActionRequests.whatChanged,
      whyChanged: wikiActionRequests.whyChanged,
      impactScope: wikiActionRequests.impactScope,
      justification: wikiActionRequests.justification,
      status: wikiActionRequests.status,
      createdAt: wikiActionRequests.createdAt,
    })
    .from(wikiActionRequests)
    .where(inArray(wikiActionRequests.status, statuses))
    .orderBy(desc(wikiActionRequests.createdAt))
    .limit(500);
  return rows;
}

// 防 unused import warning（and 留給 Phase 1f 加 owner filter 時用）
void and;

// ── Pure helpers (UI 用，不依賴 DB；server / client 都可 import) ───

/**
 * Compute a plain-text diff between payloadOld and payloadNew.
 *
 * Phase 1 不引 diff library — 簡單 line-by-line ±/= 標記即可。
 * Forge / Lens 若要 syntax highlight 或 word-level diff，Phase 2 再加。
 */
export function computeDiff(
  oldText: string | null,
  newText: string,
): DiffLine[] {
  const oldLines = (oldText ?? "").split("\n");
  const newLines = newText.split("\n");

  // 最簡 LCS-free 行對齊：兩個 set 取交集為「相同行」其餘標 ±。
  // 不保留行序準確性，但 Phase 1 是 wiki 小檔案，可讀性 ok。
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const result: DiffLine[] = [];
  for (const line of oldLines) {
    if (!newSet.has(line)) {
      result.push({ kind: "del", text: line });
    }
  }
  for (const line of newLines) {
    if (oldSet.has(line)) {
      result.push({ kind: "eq", text: line });
    } else {
      result.push({ kind: "add", text: line });
    }
  }
  return result;
}

export interface DiffLine {
  kind: "add" | "del" | "eq";
  text: string;
}

/**
 * 根據 status 決定詳情頁該顯示哪些按鈕。
 * 與 v2 §F.1-F.3 三層流程對齊。
 */
export function getActionsForStatus(status: ActionStatus): ButtonConfig[] {
  switch (status) {
    case "pending_review":
      // 要問層 — 老大批准/拒絕/編輯
      return [
        { kind: "approve", label: "同意", variant: "primary" },
        { kind: "reject", label: "拒絕", variant: "danger" },
        { kind: "edit", label: "修改後同意", variant: "ghost" },
      ];
    case "applied_pending_ack":
      // 告知層 — 已動完，老大事後同意或軟回滾
      return [
        { kind: "ack", label: "我看過了", variant: "primary" },
        { kind: "rollback", label: "復原", variant: "danger" },
      ];
    case "auto_pending":
    case "approved":
    case "worker_picked":
      // worker 處理中或排隊中，老大不需要動作
      return [];
    case "applied":
    case "auto_applied":
    case "ack":
      // 已完成終態 — 唯一可逆動作是軟回滾
      return [{ kind: "rollback", label: "復原", variant: "ghost" }];
    case "rejected":
    case "rolled_back":
    case "applied_failed":
      // 終態，無可動作
      return [];
    default:
      return [];
  }
}

export interface ButtonConfig {
  kind: "approve" | "reject" | "edit" | "ack" | "rollback";
  label: string;
  variant: "primary" | "danger" | "ghost";
}

/**
 * 給 status 一個白話中文標籤（顯示在詳情頁頂部 status badge / list 卡片）。
 *
 * 命名原則（老大 2026-05-10 反饋）：
 *   - 不用「排隊」「worker」「ack」這類技術詞
 *   - 用老大視角寫：「不用我管 / 我來看 / 我已決定」
 */
export function statusLabel(status: ActionStatus): string {
  const map: Record<ActionStatus, string> = {
    auto_pending: "成員自己處理中（不用你管）",
    auto_applied: "成員已自己處理完",
    pending_review: "等你批准",
    approved: "你已批准，成員執行中",
    worker_picked: "成員執行中",
    applied: "已執行完成",
    applied_pending_ack: "成員做完了，請看一眼",
    ack: "你已看過",
    rejected: "你已拒絕",
    rolled_back: "已軟回滾（等系統還原中）",
    applied_failed: "執行失敗",
    // Phase 1.2 (turso-003)
    rollback_failed: "軟回滾失敗",
    superseded_by_rollback: "已軟回滾並還原完成",
  };
  return map[status] ?? status;
}

/**
 * Decision layer 中文標籤（list 頁顯示）。
 */
export function layerLabel(layer: DecisionLayer): string {
  switch (layer) {
    case "auto":
      return "自主";
    case "notify":
      return "告知";
    case "review":
      return "要問";
  }
}

/**
 * Action type 中文標籤（list 頁顯示）。
 */
export function actionTypeLabel(type: ActionType): string {
  const map: Record<ActionType, string> = {
    create_page: "新建頁",
    modify_content: "修改內容",
    delete_page: "刪除頁",
    mark_stale: "標過期",
    merge_pages: "合併頁",
    split_page: "拆頁",
    adjust_tags: "改標籤",
    // Phase 1.2 (turso-003)：補償動作 row（不直接由 owner 提交，老大決策後 endpoint 自動建）
    rollback: "軟回滾還原",
  };
  return map[type] ?? type;
}
