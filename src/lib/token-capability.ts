// lib/token-capability.ts — Token capability scope guard（接 Lego ADR §E 教訓）
//
// Phase: 2 (Forge — 新建)
// Spec source: reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §E
//
// 為什麼需要：
//   Phase 1 §C.5「token 只能讀寫 wiki action 不能動其他 DB 表」是文字承諾，schema 沒落
//   capability 欄位、application 層也沒 enforce。Phase 2 補上：
//
//   1. Schema 層：wiki_tokens.capability TEXT NOT NULL（Vault migration 027 — 待落地）
//   2. Middleware 層：本檔提供 verifyTokenCapability(req, required)
//   3. HMAC secret 層：questions endpoint 用獨立 secret QUESTIONS_AGENT_HMAC_SECRET
//      （見 lib/wiki-hmac.ts；本檔不重複實作）
//
// **向後相容策略（重要）**：
//   Vault migration 027 還沒落地時（wiki_tokens 沒 capability 欄位），既有 token 都應視為
//   capability='wiki_action'（與 Phase 1 既有用途一致）。Questions endpoint 暫時**接受**
//   missing capability column 的 token：
//     - 如果 DB row 有 capability 欄位 → 嚴格驗（不對直接 reject）
//     - 如果 DB row **沒有** capability 欄位（Vault 027 未落） → fallback 到「拒絕 questions
//       endpoint，但允許 wiki_action endpoint」（最安全 default）
//   一旦 027 落地，所有既有 token row 會被 backfill 為 'wiki_action'，questions 必須新發
//   capability='questions' token 才通行。
//
// 三層守門對應：
//   - Layer 1 (Schema)：本檔 readCapability() 用 try/catch 兼容 column 存在/不存在
//   - Layer 2 (Middleware)：每個 protected endpoint 在 handler 入口宣告 required
//   - Layer 3 (HMAC Secret)：見 lib/wiki-hmac.ts getQuestionsAgentSecret()

import { eq } from "drizzle-orm";
import { wikiTokens } from "@/lib/db/schema";
import { db, getTursoClient } from "@/lib/turso";
import { verifyTokenSig } from "@/lib/wiki-hmac";

/** 已知 capability 白名單。新增必走 migration（Lego ADR §B.3 enum monotonic 規矩）。 */
export const VALID_CAPABILITIES = ["wiki_action", "questions"] as const;
export type Capability = (typeof VALID_CAPABILITIES)[number];

/**
 * 結果型：
 *   - ok=true 帶 capability 表示這個 token 的實際 scope（caller 用來比對 required）
 *   - ok=false 帶 reason
 */
export type CapabilityCheckResult =
  | { ok: true; tid: string; capability: Capability }
  | { ok: false; reason: string };

/**
 * 從 DB 直接讀 wiki_tokens.capability（如果欄位存在）。
 * 為什麼用 raw SQL：Drizzle schema.ts 還沒加 capability 欄位（Vault 027 落地前），用
 * raw client + try/catch 兼容兩種 DB 狀態（已加/未加）。
 *
 * @returns
 *   - 'wiki_action' / 'questions'：欄位存在且值合法
 *   - null：欄位存在但值不在白名單（reject）
 *   - 'undefined_column'：欄位不存在（Vault 027 未落 — caller 走向後相容路徑）
 */
async function readCapabilityRaw(
  tid: string,
): Promise<Capability | null | "undefined_column"> {
  try {
    const client = getTursoClient();
    const rs = await client.execute({
      sql: "SELECT capability FROM wiki_tokens WHERE id = ? LIMIT 1",
      args: [tid],
    });
    if (rs.rows.length === 0) return null; // token 不存在於 DB
    const row = rs.rows[0];
    const capRaw = row[0] ?? row["capability"];
    if (typeof capRaw !== "string") return null;
    if ((VALID_CAPABILITIES as readonly string[]).includes(capRaw)) {
      return capRaw as Capability;
    }
    return null; // 未知 capability 一律 reject（不放行）
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // SQLite/libSQL "no such column: capability" → Vault 027 未落地
    if (/no such column.*capability/i.test(msg)) {
      return "undefined_column";
    }
    // 其他 DB 錯誤 → fail-closed
    throw e;
  }
}

/**
 * 完整 verify cookie token + capability 對齊 required。
 *
 * Use case：questions endpoint handler 入口呼叫
 *   const r = await verifyTokenCapability(token, 'questions');
 *   if (!r.ok) return jsonError(403, r.reason);
 *
 * @param token Token string（從 cookie 拿）
 * @param required 該 endpoint 預期的 capability
 */
export async function verifyTokenCapability(
  token: string | null | undefined,
  required: Capability,
): Promise<CapabilityCheckResult> {
  if (!token) {
    return { ok: false, reason: "missing_token" };
  }

  // 1. sig + exp（stateless）
  const sigCheck = verifyTokenSig(token);
  if (!sigCheck.valid) {
    return { ok: false, reason: `bad_token_${sigCheck.reason}` };
  }
  const tid = sigCheck.payload.tid;

  // 2. DB lookup — revoke / expire / capability
  let row: { revokedAt: number | null; expiresAt: number } | null = null;
  try {
    const rows = await db
      .select({
        revokedAt: wikiTokens.revokedAt,
        expiresAt: wikiTokens.expiresAt,
      })
      .from(wikiTokens)
      .where(eq(wikiTokens.id, tid))
      .limit(1);
    row = rows[0] ?? null;
  } catch {
    // DB 故障 fail-closed
    return { ok: false, reason: "token_db_error" };
  }
  if (!row) return { ok: false, reason: "token_not_found" };
  if (row.revokedAt !== null) return { ok: false, reason: "token_revoked" };
  if (row.expiresAt < Date.now()) return { ok: false, reason: "token_expired" };

  // 3. Capability 比對（向後相容：Vault 027 未落時走 fallback）
  let cap: Capability | null | "undefined_column";
  try {
    cap = await readCapabilityRaw(tid);
  } catch {
    return { ok: false, reason: "token_db_error" };
  }

  if (cap === "undefined_column") {
    // Vault migration 027 未落地。
    // 向後相容策略：既有 token 視為 'wiki_action'。
    //   - required='wiki_action' → 放行（既有 Phase 1 行為不變）
    //   - required='questions'    → 拒絕（最安全 default；逼 Vault 027 落地後才能用）
    if (required === "wiki_action") {
      return { ok: true, tid, capability: "wiki_action" };
    }
    return {
      ok: false,
      reason: "capability_column_missing_run_migration_027",
    };
  }
  if (cap === null) {
    return { ok: false, reason: "token_unknown_capability" };
  }
  if (cap !== required) {
    return { ok: false, reason: `insufficient_capability_have_${cap}_need_${required}` };
  }
  return { ok: true, tid, capability: cap };
}
