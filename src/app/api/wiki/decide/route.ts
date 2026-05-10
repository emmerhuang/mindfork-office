// app/api/wiki/decide/route.ts — 老大決策 endpoint
//
// Phase: 1a (P1-2 by Forge — 骨架)
// Phase: 1c (P1-4 by Forge — 實作完整邏輯)
// Lens P1-A 修：route 從 src/app/wiki/api/decide 移到 src/app/api/wiki/decide
//
// 邏輯（v2 doc §F.2 §F.3 + Vault schema turso-001 trigger T8/T9/T10）：
//   1. Auth：暫用 admin-auth pattern（verifyAdminCookie）— 老大從 webapp 點按鈕、
//      browser 帶 mfo_admin cookie。P1-14 token middleware 完成後改用 magic link token
//      （含 wiki_tokens DB revoke check）。
//   2. Parse body { action, request_id, justification?, reject_reason?, rollback_reason?, payload_edited? }
//   3. Lookup wiki_action_requests by request_id，依 action 走 state machine：
//        approve   (review):  pending_review      → approved
//                              UPDATE decided_at, payload_edited?
//        reject    (review):  pending_review      → rejected
//                              UPDATE decided_at, reject_reason (T8 必填)
//                              ★ 派工單寫「必填 justification」是錯的 —
//                              SQL trigger T8 強制的是 reject_reason；justification 是 review 層 INSERT 時必填
//        ack       (notify):  applied_pending_ack → ack
//        rollback  (notify):  applied_pending_ack → rolled_back
//                              UPDATE rolled_back_at, rolled_back_by='boss', rollback_reason (T9 必填)
//                              ★ 派工單寫「→ rollback_pending」schema 沒這 status；
//                              T10 合法轉換是 applied_pending_ack → rolled_back
//   4. Drizzle UPDATE — SQL trigger T10 兜底擋非法轉換（重複 approve / 跳階等）
//   5. INSERT chat_messages（Turso）通知 owner（v2 §F：worker 動完才寫 / 老大決策後 endpoint 寫）
//      由於本輪只動 decide endpoint、worker 是 P1-5：
//        approve:  暫不寫 chat_messages（worker 動完才寫 — 等 P1-5）
//        reject:   寫 chat_messages 給 owner inbox：'你的提議被 reject，理由：...'
//        ack:      寫 chat_messages 給 owner inbox：'老大已 acknowledge 你的告知'
//        rollback: 寫 chat_messages 給 owner inbox：'你的動作被軟回滾，理由：...'
//      ★ 注意：chat_messages 寫到 Turso（v2 §D.4 兩邊都有，sync-all 會拉到本機）
//      ★ Turso chat_messages schema 比本機簡，只有 (id, channel_id, sender, recipient, content, created_at, archived_at)
//        沒 channel_type / metadata / is_read / synced — 用 Turso schema 為準
//
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §F.2 §F.3

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  wikiActionRequests,
  NARRATIVE_MAX_LENGTH,
  PAYLOAD_MAX_BYTES,
  type ActionStatus,
} from "@/lib/db/schema";
import { db } from "@/lib/turso";
import { WIKI_TOKEN_COOKIE } from "@/lib/wiki-auth";
import { verifyAdminCookie } from "@/lib/admin-auth";
import { verifyTokenCapability } from "@/lib/token-capability";
import { isDryRun, dryRunResponse, requireDryRunAudit } from "@/lib/dry-run";
import { notifyOwnerOfDecision } from "@/lib/telegram-notify";

export const runtime = "nodejs";

// ============================================================================
// Types
// ============================================================================

const DECIDE_ACTIONS = ["approve", "reject", "ack", "rollback"] as const;
type DecideAction = (typeof DECIDE_ACTIONS)[number];

interface DecideBody {
  action?: unknown;
  request_id?: unknown;
  justification?: unknown;
  reject_reason?: unknown;
  rollback_reason?: unknown;
  payload_edited?: unknown;
}

function jsonError(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...details }, { status });
}

// ============================================================================
// chat_messages writer
// ============================================================================
//
// Phase 1e (P1-8 整合)：改走 lib/telegram-notify.ts 統一寫入 + canonical 強制。
// 舊版本直接用 raw libSQL client（保留邏輯但拆到 lib 共用，sender/recipient 強制小寫白名單）。

// ============================================================================
// POST handler
// ============================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ----- 1. Auth (Phase 1g P1-14：mfo_admin OR wiki_admin_token 雙路徑) -----
  // Phase 2 hotfix (2026-05-10)：token 路徑須帶 capability='wiki_action'；不再委派
  // verifyWikiAccess（它會吞掉 capability_mismatch 的 reason），改自己跑 capability check
  // 才能正確區分 401（沒 token）vs 403（token 有但 scope 不對）。
  //
  // 老大從 Telegram 點 magic link → middleware rewrite 到 /api/wiki/auth-magic →
  // set wiki_admin_token cookie → redirect 回 /wiki → DecisionButtons.tsx fetch
  // 本 endpoint 帶 wiki_admin_token cookie。
  // 老大內網 / 直接打密碼登入 → 走 mfo_admin cookie 路徑（root，跳過 capability）。
  if (!verifyAdminCookie(req)) {
    const tokenStr = req.cookies.get(WIKI_TOKEN_COOKIE)?.value;
    const cap = await verifyTokenCapability(tokenStr, "wiki_action");
    if (!cap.ok) {
      const isAuthMissing =
        cap.reason === "missing_token" ||
        cap.reason === "token_revoked" ||
        cap.reason === "token_expired" ||
        cap.reason === "token_not_found" ||
        cap.reason.startsWith("bad_token_") ||
        cap.reason === "token_db_error";
      const status = isAuthMissing ? 401 : 403;
      return jsonError(
        status,
        isAuthMissing ? "unauthorized" : "capability_mismatch",
        {
          reason: cap.reason,
          hint: "decide endpoint requires admin cookie or wiki_admin_token with capability=wiki_action",
        },
      );
    }
  }

  // ----- 2. Parse body -----
  let body: DecideBody;
  try {
    body = (await req.json()) as DecideBody;
  } catch {
    return jsonError(400, "invalid_json");
  }
  if (!body || typeof body !== "object") {
    return jsonError(400, "body_not_object");
  }

  // ----- 3. Validate action -----
  const action = body.action;
  if (
    typeof action !== "string" ||
    !(DECIDE_ACTIONS as readonly string[]).includes(action)
  ) {
    return jsonError(400, "action_invalid", { allowed: DECIDE_ACTIONS });
  }
  const decideAction = action as DecideAction;

  // ----- 4. Validate request_id -----
  const reqId = body.request_id;
  if (typeof reqId !== "number" || !Number.isInteger(reqId) || reqId <= 0) {
    return jsonError(400, "request_id_invalid", {
      hint: "request_id must be positive integer",
    });
  }

  // ----- 5. Lookup current row -----
  const rows = await db
    .select()
    .from(wikiActionRequests)
    .where(eq(wikiActionRequests.id, reqId))
    .limit(1);
  if (rows.length === 0) {
    return jsonError(404, "request_not_found", { request_id: reqId });
  }
  const current = rows[0];

  // ----- 6. Validate action vs decision_layer pre-check -----
  // 早擋以給清楚錯誤訊息；T10 兜底會在 UPDATE 時 ABORT 但 endpoint 早擋訊息更友善
  if (decideAction === "approve" || decideAction === "reject") {
    if (current.decisionLayer !== "review") {
      return jsonError(400, "action_layer_mismatch", {
        action: decideAction,
        current_layer: current.decisionLayer,
        hint: "approve/reject only valid for review-layer requests",
      });
    }
    if (current.status !== "pending_review") {
      return jsonError(409, "illegal_status_for_action", {
        action: decideAction,
        current_status: current.status,
        hint: "only pending_review can approve/reject",
      });
    }
  } else {
    // ack / rollback
    if (current.decisionLayer !== "notify") {
      return jsonError(400, "action_layer_mismatch", {
        action: decideAction,
        current_layer: current.decisionLayer,
        hint: "ack/rollback only valid for notify-layer requests",
      });
    }
    if (current.status !== "applied_pending_ack") {
      return jsonError(409, "illegal_status_for_action", {
        action: decideAction,
        current_status: current.status,
        hint: "only applied_pending_ack can ack/rollback",
      });
    }
  }

  // ----- 7. Validate per-action required fields -----
  const now = Date.now();
  let updateFields: Partial<{
    status: ActionStatus;
    decidedAt: number;
    rejectReason: string;
    rolledBackAt: number;
    rolledBackBy: "boss";
    rollbackReason: string;
    payloadEdited: string;
  }> = {};

  switch (decideAction) {
    case "approve": {
      // payload_edited 可選（review 後老大微調 payload）
      if (
        body.payload_edited !== undefined &&
        body.payload_edited !== null
      ) {
        if (typeof body.payload_edited !== "string") {
          return jsonError(400, "payload_edited_not_string");
        }
        const byteLen = Buffer.byteLength(body.payload_edited, "utf8");
        if (byteLen > PAYLOAD_MAX_BYTES) {
          return jsonError(413, "payload_edited_too_large", {
            max_bytes: PAYLOAD_MAX_BYTES,
          });
        }
        updateFields.payloadEdited = body.payload_edited;
      }
      updateFields.status = "approved";
      updateFields.decidedAt = now;
      break;
    }
    case "reject": {
      // T8 強制 reject 必填 reject_reason（不是 justification）
      // 派工單字眼錯，按 schema 走，向上回報
      const rr = body.reject_reason;
      if (
        typeof rr !== "string" ||
        rr.length === 0 ||
        rr.length > NARRATIVE_MAX_LENGTH
      ) {
        return jsonError(400, "reject_reason_required", {
          hint: "non-empty string, <= 4096 chars (派工單寫 justification 是錯的，schema T8 要的是 reject_reason)",
        });
      }
      updateFields.status = "rejected";
      updateFields.decidedAt = now;
      updateFields.rejectReason = rr;
      break;
    }
    case "ack": {
      updateFields.status = "ack";
      updateFields.decidedAt = now;
      break;
    }
    case "rollback": {
      // Phase 1.2 (turso-003 LIVE 2026-05-10): 兩步走實作
      //   Step A (本 endpoint): UPDATE 原 war status='rolled_back' (T9 守 rolled_back_at +
      //          rolled_back_by + rollback_reason) — 標記「老大要求軟回滾」。
      //   Step B (本 endpoint): INSERT 新 rollback war (action_type='rollback',
      //          status='auto_pending', related_war_id=原 war_id, owner=原 war.owner,
      //          target_page=原 war.target_page) — 補償動作 row。
      //   Step C (worker side): worker 撈到 status=auto_pending 的 rollback war，
      //          從原 war.backup_path 還原檔案，成功後：
      //            - 升該 rollback war status='auto_applied'（要 backup_path，T6 守）
      //            - 升原 war status='rolled_back' → 'superseded_by_rollback' (T10 合法)
      //          失敗則：rollback war status='rollback_failed'（要 worker_error，T7 守），
      //          原 war 維持 'rolled_back'（不升 superseded）。
      //
      // T9 強制 rolled_back 必填 rolled_back_at + rolled_back_by + rollback_reason
      const rr = body.rollback_reason;
      if (
        typeof rr !== "string" ||
        rr.length === 0 ||
        rr.length > NARRATIVE_MAX_LENGTH
      ) {
        return jsonError(400, "rollback_reason_required", {
          hint: "non-empty string, <= 4096 chars",
        });
      }
      // 額外閘：rollback 必須有 backup_path 才有得還原（worker step C 依賴）
      if (!current.backupPath || current.backupPath.length === 0) {
        return jsonError(409, "rollback_no_backup", {
          hint: "原 war 沒有 backup_path，無法軟回滾（worker 端無檔案可還原）。",
          request_id: reqId,
        });
      }
      // 額外閘：rollback action 自身不可被 rollback（避免 nested rollback 路徑）
      if (current.actionType === "rollback") {
        return jsonError(400, "cannot_rollback_a_rollback", {
          hint: "rollback action row 不可再被 rollback；如要追加補償請建新 war。",
        });
      }
      updateFields.status = "rolled_back";
      updateFields.decidedAt = now;
      updateFields.rolledBackAt = now;
      updateFields.rolledBackBy = "boss";
      updateFields.rollbackReason = rr;
      break;
    }
  }

  // ----- 7.5 dry-run 攔截 -----
  // Phase 1e (P3-NEW Lens 1d 修補)：dry-run 必須帶 X-Lens-Reason header（audit trail）
  if (isDryRun(req)) {
    const auditCheck = requireDryRunAudit(req);
    if (!auditCheck.ok) {
      return jsonError(400, auditCheck.error, { hint: auditCheck.hint });
    }
    return dryRunResponse({
      would_update: true,
      request_id: reqId,
      action: decideAction,
      from_status: current.status,
      to_status: updateFields.status,
    });
  }

  // ----- 8. UPDATE wiki_action_requests -----
  // Lens P2-C：條件式 UPDATE 收斂 TOCTOU race
  //   舊版：read status → pre-check OK → UPDATE id=?
  //         兩個 admin 同時點 approve，兩條 request 都過了 pre-check（都看到 pending_review），
  //         一前一後 UPDATE 各自把欄位（包含 decided_at）寫上去 → 第二筆會覆蓋第一筆的 decided_at，
  //         語意上「兩次 approve 都成功」，違反 idempotent 期望。
  //   新版：UPDATE ... WHERE id=? AND status=<expected>，把競態收斂到單一 SQL；
  //         affected rows = 0 表示 status 已被別人改過，回 409 + 提示「狀態已變更」。
  //   T10 兜底：SQL trigger 在 status 轉換非法時 ABORT，這裡 catch 是雙端對齊保險。
  const expectedStatus = current.status; // 凍結 read 那一刻的 status 當 WHERE 條件
  let affectedRows: number;
  try {
    const result = await db
      .update(wikiActionRequests)
      .set(updateFields)
      .where(
        and(
          eq(wikiActionRequests.id, reqId),
          eq(wikiActionRequests.status, expectedStatus),
        ),
      )
      .returning({ id: wikiActionRequests.id });
    affectedRows = result.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(500, "db_update_failed", { detail: msg });
  }
  if (affectedRows === 0) {
    // status 已被別人改過（可能：另一個 admin 同時點 approve / worker 已 pick）
    return jsonError(409, "status_changed_during_decision", {
      request_id: reqId,
      expected_status: expectedStatus,
      hint: "狀態已被其他操作改變，請重新整理頁面後再試",
    });
  }

  // ----- 8.5 rollback 專屬：INSERT 新 rollback war (Phase 1.2 turso-003) -----
  //
  // 原 war 已 UPDATE 成 'rolled_back'。現在 INSERT 一筆新 rollback war 給 worker 撈：
  //   - action_type='rollback'         (T11 守 related_war_id 必填且原 war 必須存在)
  //   - decision_layer='auto'          (worker 撈 auto_pending 自動處理；不需老大再批准軟回滾的執行)
  //   - status='auto_pending'          (T3 守 auto layer 初始 status)
  //   - related_war_id=原 war_id       (T11 必填、T12 反向守非 rollback 不可填)
  //   - target_page=原 target_page     (worker 還原此檔案)
  //   - payload_new='(rollback)'       (T1 length>=1；rollback 不從 payload 讀內容，從原 war.backup_path 取)
  //   - owner=原 war.owner             (補償 row 屬於誰要修就是誰；通知也送他)
  //   - initiated_by='boss'            (老大發起的回滾)
  //   - 三欄白話文 not required (auto layer 不強制；T5 只守 notify)
  //
  // 失敗 path：rollback war INSERT 失敗 → 原 war 已落 rolled_back 但無對應補償 row。
  //   選擇：回 500 並標明「partial state」，secretary 看 log 介入；不回滾原 war 的 status
  //   （原 war UPDATE 已 commit；schema append-only 也不允許「撤銷」UPDATE）。
  let rollbackWarId: number | null = null;
  if (decideAction === "rollback") {
    try {
      const rbInsert = await db
        .insert(wikiActionRequests)
        .values({
          actionType: "rollback",
          decisionLayer: "auto",
          targetPage: current.targetPage,
          relatedPages: null,
          relatedWarId: reqId,
          owner: current.owner,
          initiatedBy: "boss",
          payloadOld: null,
          payloadNew: "(rollback)",
          payloadEdited: null,
          whatChanged: null,
          whyChanged: null,
          impactScope: null,
          justification: null,
          rejectReason: null,
          status: "auto_pending",
          backupPath: null,
          workerError: null,
          createdAt: now,
        })
        .returning({ id: wikiActionRequests.id });
      rollbackWarId = rbInsert[0]?.id ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 原 war 已 UPDATE 成 rolled_back（commit 過了），但補償 row 沒 INSERT 成功。
      // 回 500 + 詳情，讓 secretary 在 log 看到並手動介入。
      console.error(
        `[decide] rollback war INSERT failed for original war ${reqId}: ${msg}`,
      );
      return jsonError(500, "rollback_insert_failed", {
        original_war_id: reqId,
        original_status_after: "rolled_back",
        detail: msg,
        hint: "原 war 已標 rolled_back，但補償 rollback war 沒建。secretary 介入。",
      });
    }
  }

  // ----- 9. Write chat_messages 通知 owner -----
  //
  // Phase 1e (P1-8 + Task 3 補 approve 通知)：
  //   - approve  → 寫 owner inbox：「你提交的 X 已批准、worker 動完會通知你」
  //               （worker 動完才會再寫一筆 applied 結果，那是 P1-5 worker 的工作）
  //   - reject   → 寫 owner inbox：被 reject + 理由
  //   - ack      → 寫 owner inbox：老大已 acknowledge
  //   - rollback → 寫 owner inbox：被軟回滾 + 理由 + 等 worker 從 backup 還原
  //
  // 改走 lib/telegram-notify.ts notifyOwnerOfDecision（強制小寫白名單 + canonical channel_id）
  let notifyContent: string | null = null;
  switch (decideAction) {
    case "approve":
      notifyContent = `【決策】你提交的 ${current.actionType} (${current.targetPage}) 已被老大批准。worker 動完後會再通知你結果。`;
      break;
    case "reject":
      notifyContent = `【決策】你的提議 (${current.actionType} → ${current.targetPage}) 被老大 reject。理由：${updateFields.rejectReason}`;
      break;
    case "ack":
      notifyContent = `【決策】你的告知 (${current.actionType} → ${current.targetPage}) 老大已 acknowledge。`;
      break;
    case "rollback":
      notifyContent =
        `【決策】老大要求軟回滾你之前的動作 (${current.actionType} → ${current.targetPage})。` +
        `\n理由：${updateFields.rollbackReason}` +
        `\n等 worker 從 backup 還原中（rollback war_id=${rollbackWarId ?? "?"}）。`;
      break;
  }
  if (notifyContent) {
    try {
      const r = await notifyOwnerOfDecision({
        owner: current.owner,
        content: notifyContent,
      });
      if (!r.ok) {
        // chat_messages 寫失敗不影響主流程（status 已更新），log 即可
        // 老大 #6414 答 A 等價：通知失敗時 endpoint 仍回成功，下次 sync 補
        console.error(
          `[decide] notifyOwnerOfDecision failed for war ${reqId}: ${r.reason}`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[decide] notifyOwnerOfDecision threw for war ${reqId}: ${msg}`,
      );
    }
  }

  return NextResponse.json(
    {
      request_id: reqId,
      action: decideAction,
      status: updateFields.status,
      decided_at: now,
      ...(rollbackWarId !== null ? { rollback_war_id: rollbackWarId } : {}),
    },
    { status: 200 },
  );
}
