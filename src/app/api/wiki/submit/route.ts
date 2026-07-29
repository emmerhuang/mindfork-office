// app/api/wiki/submit/route.ts — Subagent 提交 wiki 動作 endpoint
//
// Phase: 1b (P1-3 by Forge)
// Lens P1-A 修：route 從 src/app/wiki/api/submit 移到 src/app/api/wiki/submit
//   既有慣例 src/app/api/* + next.config.ts source: '/api/:path*' 命中 API security header
//
// 邏輯（v2 doc §F + Vault schema turso-001-create-wiki-action-requests.sql）：
//   1. 解析 request body（utf8 raw bytes）
//   2. verify HMAC：X-Agent-HMAC（用 MEMORY_AGENT_HMAC_SECRET）
//   3. payload size limit 100KB（v2 §A.1）
//   4. validate body schema（action_type / decision_layer / owner / payload_*）
//   5. validate target_page 路徑白名單 + path traversal 防護（lib/wiki-paths.ts）
//   6. 三層初始 status（嚴格按 SQL trigger T3，老大 #6414 答 A）：
//        decision_layer='auto'   → status='auto_pending'
//        decision_layer='notify' → status='auto_pending'  ★派工單寫 pending_review 是錯的，
//                                                        SQL T3 寫死 notify 必須 auto_pending；
//                                                        worker 動完才升 applied_pending_ack（v2 §F.2）
//        decision_layer='review' → status='pending_review'
//   7. INSERT wiki_action_requests via Drizzle
//   8. return { war_id, status }
//
// 通知老大的落點（2026-07-29 Forge 更新）：
//   要問層送出後走 notifyBossOfPendingReview()，寫進 Turso `boss_notifications`
//   （migration turso-006）。原本寫的是 chat_messages，隨私聊拆除搬家。
//   實際推播由本機的 boss_notifications_pull.py 執行（雲端無 bot 憑證）。
//
// 不在本輪做：
//   - log filter（middleware 端做，P1-14）
//
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §F

import { NextRequest, NextResponse } from "next/server";
import {
  wikiActionRequests,
  ACTION_TYPES,
  DECISION_LAYERS,
  OWNERS,
  INITIATED_BY,
  PAYLOAD_MAX_BYTES,
  NARRATIVE_MAX_LENGTH,
  type ActionType,
  type DecisionLayer,
  type Owner,
  type InitiatedBy,
  type ActionStatus,
} from "@/lib/db/schema";
import { db } from "@/lib/turso";
import { verifyAgentSig } from "@/lib/wiki-hmac";
import {
  validateWikiPath,
  WIKI_PATH_WHITELIST_DESCRIPTION,
} from "@/lib/wiki-paths";
import { isDryRun, dryRunResponse, requireDryRunAudit } from "@/lib/dry-run";
import { notifyBossOfPendingReview } from "@/lib/telegram-notify";

export const runtime = "nodejs";

// ============================================================================
// Helpers
// ============================================================================

interface SubmitBody {
  action_type?: unknown;
  decision_layer?: unknown;
  target_page?: unknown;
  related_pages?: unknown; // optional, JSON array of paths
  owner?: unknown;
  initiated_by?: unknown; // optional, default 'agent'
  payload_old?: unknown;
  payload_new?: unknown;
  payload_edited?: unknown;
  what_changed?: unknown;
  why_changed?: unknown;
  impact_scope?: unknown;
  justification?: unknown;
}

interface ValidatedSubmit {
  actionType: ActionType;
  decisionLayer: DecisionLayer;
  targetPage: string;
  relatedPages: string | null;
  owner: Owner;
  initiatedBy: InitiatedBy;
  payloadOld: string | null;
  payloadNew: string;
  whatChanged: string | null;
  whyChanged: string | null;
  impactScope: string | null;
  justification: string | null;
  status: ActionStatus;
}

function jsonError(
  status: number,
  error: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...details }, { status });
}

function isStringInUnion<T extends readonly string[]>(
  value: unknown,
  union: T,
): value is T[number] {
  return typeof value === "string" && (union as readonly string[]).includes(value);
}

function validateNarrative(
  v: unknown,
  fieldName: string,
): string | null | { error: string } {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") {
    return { error: `${fieldName}_not_string` };
  }
  if (v.length === 0) return null; // 空字串視為未提供
  if (v.length > NARRATIVE_MAX_LENGTH) {
    return { error: `${fieldName}_too_long` };
  }
  return v;
}

/**
 * Payload validation 結果。
 *
 * Lens P2-A：把 `payload_*_missing/empty/not_string` 跟 `payload_*_too_large`
 * 拆成不同 error class — 前三者是 client request shape 錯，HTTP 400；
 * 後者是「shape 對但超量」，HTTP 413（Payload Too Large）才語意正確。
 * caller 用 `kind` 決定 status code，避免 missing/empty 也被誤判為 413。
 */
type PayloadValidationError =
  | { kind: "shape"; error: string }
  | { kind: "too_large"; error: string };

function validatePayload(
  v: unknown,
  fieldName: string,
  required: boolean,
): string | null | PayloadValidationError {
  if (v === null || v === undefined) {
    if (required) return { kind: "shape", error: `${fieldName}_missing` };
    return null;
  }
  if (typeof v !== "string") {
    return { kind: "shape", error: `${fieldName}_not_string` };
  }
  // utf8 byte length（中文字 ~3 bytes）
  const byteLen = Buffer.byteLength(v, "utf8");
  if (byteLen === 0 && required) {
    return { kind: "shape", error: `${fieldName}_empty` };
  }
  if (byteLen > PAYLOAD_MAX_BYTES) {
    return { kind: "too_large", error: `${fieldName}_too_large` };
  }
  return v;
}

function isPayloadValidationError(
  v: string | null | PayloadValidationError,
): v is PayloadValidationError {
  return typeof v === "object" && v !== null && "kind" in v;
}

function deriveInitialStatus(layer: DecisionLayer): ActionStatus {
  // SQL trigger T3 嚴格守門：每層只接 1 個合法初值（老大 #6414 答 A）
  switch (layer) {
    case "auto":
      return "auto_pending";
    case "notify":
      return "auto_pending"; // worker 動完才升 applied_pending_ack（v2 §F.2）
    case "review":
      return "pending_review";
  }
}

// ============================================================================
// POST handler
// ============================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ----- 1. 讀 raw body（HMAC 必須對 raw bytes 算，不能對 JSON.parse 後再 stringify） -----
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonError(400, "body_read_failed");
  }

  // 整體 body size 上限（payload_new + payload_old + 三欄白話文 + 雜項，通常 <= 200KB）
  // 給寬鬆一點：500KB（單一 payload 100KB 上限由 validatePayload 個別擋）
  if (Buffer.byteLength(rawBody, "utf8") > 500 * 1024) {
    return jsonError(413, "body_too_large", {
      max_bytes: 500 * 1024,
    });
  }

  // ----- 2. HMAC verify -----
  const providedSig = req.headers.get("x-agent-hmac");
  if (!verifyAgentSig(rawBody, providedSig)) {
    // timing-safe 內部處理；外部訊息保持模糊（不告訴攻擊者哪裡錯）
    return jsonError(401, "unauthorized", {
      hint: "X-Agent-HMAC header missing or invalid",
    });
  }

  // ----- 3. Parse JSON -----
  let body: SubmitBody;
  try {
    body = JSON.parse(rawBody) as SubmitBody;
  } catch {
    return jsonError(400, "invalid_json");
  }
  if (!body || typeof body !== "object") {
    return jsonError(400, "body_not_object");
  }

  // ----- 4. Validate enum fields -----
  if (!isStringInUnion(body.action_type, ACTION_TYPES)) {
    return jsonError(400, "action_type_invalid", {
      allowed: ACTION_TYPES,
    });
  }
  if (!isStringInUnion(body.decision_layer, DECISION_LAYERS)) {
    return jsonError(400, "decision_layer_invalid", {
      allowed: DECISION_LAYERS,
    });
  }
  if (!isStringInUnion(body.owner, OWNERS)) {
    return jsonError(400, "owner_invalid", { allowed: OWNERS });
  }
  const initiatedBy: InitiatedBy = isStringInUnion(
    body.initiated_by,
    INITIATED_BY,
  )
    ? body.initiated_by
    : "agent";

  const actionType = body.action_type as ActionType;
  const decisionLayer = body.decision_layer as DecisionLayer;
  const owner = body.owner as Owner;

  // ----- 5. Validate target_page (path whitelist + traversal) -----
  const pathCheck = validateWikiPath(body.target_page);
  if (!pathCheck.valid) {
    return jsonError(400, "target_page_invalid", {
      reason: pathCheck.reason,
      whitelist: WIKI_PATH_WHITELIST_DESCRIPTION,
    });
  }
  const targetPage = body.target_page as string;

  // related_pages 可選，必須是 JSON-stringified array of strings 或 array
  let relatedPagesStr: string | null = null;
  if (body.related_pages !== undefined && body.related_pages !== null) {
    let arr: unknown;
    if (typeof body.related_pages === "string") {
      try {
        arr = JSON.parse(body.related_pages);
      } catch {
        return jsonError(400, "related_pages_not_json");
      }
    } else {
      arr = body.related_pages;
    }
    if (!Array.isArray(arr)) {
      return jsonError(400, "related_pages_not_array");
    }
    for (const p of arr) {
      const c = validateWikiPath(p);
      if (!c.valid) {
        return jsonError(400, "related_pages_item_invalid", {
          item: p,
          reason: c.reason,
        });
      }
    }
    relatedPagesStr = JSON.stringify(arr);
  }

  // ----- 6. Validate payload sizes -----
  // Lens P2-A: missing/empty/not_string → 400; too_large → 413
  const payloadNewResult = validatePayload(body.payload_new, "payload_new", true);
  if (isPayloadValidationError(payloadNewResult)) {
    const status = payloadNewResult.kind === "too_large" ? 413 : 400;
    return jsonError(status, payloadNewResult.error, {
      max_bytes: PAYLOAD_MAX_BYTES,
    });
  }
  const payloadNew = payloadNewResult as string;

  const payloadOldResult = validatePayload(body.payload_old, "payload_old", false);
  if (isPayloadValidationError(payloadOldResult)) {
    const status = payloadOldResult.kind === "too_large" ? 413 : 400;
    return jsonError(status, payloadOldResult.error, {
      max_bytes: PAYLOAD_MAX_BYTES,
    });
  }
  const payloadOld = payloadOldResult as string | null;

  // ----- 7. Validate narrative fields (告知/要問層必填) -----
  const what = validateNarrative(body.what_changed, "what_changed");
  if (typeof what === "object" && what !== null && "error" in what) {
    return jsonError(400, what.error, { max_chars: NARRATIVE_MAX_LENGTH });
  }
  const why = validateNarrative(body.why_changed, "why_changed");
  if (typeof why === "object" && why !== null && "error" in why) {
    return jsonError(400, why.error, { max_chars: NARRATIVE_MAX_LENGTH });
  }
  const impact = validateNarrative(body.impact_scope, "impact_scope");
  if (typeof impact === "object" && impact !== null && "error" in impact) {
    return jsonError(400, impact.error, { max_chars: NARRATIVE_MAX_LENGTH });
  }
  const just = validateNarrative(body.justification, "justification");
  if (typeof just === "object" && just !== null && "error" in just) {
    return jsonError(400, just.error, { max_chars: NARRATIVE_MAX_LENGTH });
  }

  // 三層必填檢查（與 SQL trigger T4 / T5 雙端對齊；Endpoint 早擋避免 Drizzle Insert 才被 trigger 拒）
  if (decisionLayer === "review" && (!just || (typeof just === "string" && just.length === 0))) {
    return jsonError(400, "justification_required_for_review_layer");
  }
  if (decisionLayer === "notify") {
    if (!what || (typeof what === "string" && what.length === 0)) {
      return jsonError(400, "what_changed_required_for_notify_layer");
    }
    if (!why || (typeof why === "string" && why.length === 0)) {
      return jsonError(400, "why_changed_required_for_notify_layer");
    }
    if (!impact || (typeof impact === "string" && impact.length === 0)) {
      return jsonError(400, "impact_scope_required_for_notify_layer");
    }
  }

  // ----- 8. 三層初始 status -----
  const status = deriveInitialStatus(decisionLayer);

  // ----- 8.5 dry-run 攔截（Lens 測試用）-----
  // 跑完所有 validation 但不真的 INSERT；給 Lens 驗 attack vector 不污染 production DB。
  // Phase 1e (P3-NEW Lens 1d 修補)：dry-run 必須帶 X-Lens-Reason header（audit trail）
  if (isDryRun(req)) {
    const auditCheck = requireDryRunAudit(req);
    if (!auditCheck.ok) {
      return jsonError(400, auditCheck.error, { hint: auditCheck.hint });
    }
    return dryRunResponse({
      would_insert: true,
      war_id_preview: null,
      preview: {
        action_type: actionType,
        decision_layer: decisionLayer,
        target_page: targetPage,
        owner,
        initiated_by: initiatedBy,
        status,
      },
    });
  }

  // ----- 9. INSERT into wiki_action_requests -----
  const validated: ValidatedSubmit = {
    actionType,
    decisionLayer,
    targetPage,
    relatedPages: relatedPagesStr,
    owner,
    initiatedBy,
    payloadOld,
    payloadNew,
    whatChanged: typeof what === "string" ? what : null,
    whyChanged: typeof why === "string" ? why : null,
    impactScope: typeof impact === "string" ? impact : null,
    justification: typeof just === "string" ? just : null,
    status,
  };

  const now = Date.now();
  let warId: number;
  try {
    const result = await db
      .insert(wikiActionRequests)
      .values({
        actionType: validated.actionType,
        decisionLayer: validated.decisionLayer,
        targetPage: validated.targetPage,
        relatedPages: validated.relatedPages,
        owner: validated.owner,
        initiatedBy: validated.initiatedBy,
        payloadOld: validated.payloadOld,
        payloadNew: validated.payloadNew,
        whatChanged: validated.whatChanged,
        whyChanged: validated.whyChanged,
        impactScope: validated.impactScope,
        justification: validated.justification,
        status: validated.status,
        createdAt: now,
      })
      .returning({ id: wikiActionRequests.id });
    if (!result || result.length === 0 || typeof result[0].id !== "number") {
      throw new Error("insert returned no id");
    }
    warId = result[0].id;
  } catch (e) {
    // SQL trigger ABORT（T3/T4/T5）會丟到這裡；endpoint 上面已預擋 normal case，
    // 走到這裡是 schema-level 防線兜底，回 500 + 訊息給 caller debug
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(500, "db_insert_failed", { detail: msg });
  }

  // ----- 10. 要問層 push 老大（Phase 1e P1-8）-----
  // 告知層 (notify) 動完才推（worker 端 P1-5 處理）；要問層 (review) submit 時就推
  // push 失敗不阻擋主流程（status 已 INSERT，下次 sync 仍能補通知）— log 即可
  if (decisionLayer === "review") {
    try {
      const r = await notifyBossOfPendingReview({
        warId,
        actionType,
        targetPage,
        owner,
        justification: typeof just === "string" ? just : null,
      });
      if (!r.ok) {
        console.error(
          `[submit] notifyBossOfPendingReview failed for war ${warId}: ${r.reason}`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[submit] notifyBossOfPendingReview threw for war ${warId}: ${msg}`);
    }
  }

  return NextResponse.json(
    {
      war_id: warId,
      status: validated.status,
    },
    { status: 201 },
  );
}
