// lib/telegram-notify.ts — Telegram push 整合 helper（Memory Webapp Phase 1）
//
// Phase: 1e (P1-8 by Forge — 新建)
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §F
//
// 設計決策：
//   1. Vercel serverless 不能直接呼叫 Telegram bot — 既有架構：Vercel 寫 Turso chat_messages
//      → 本機 sync-all（Python cron）拉到本機 SQLite → 本機 telegram bot 推老大。
//      Vercel 端只負責「寫一筆 chat_messages with magic link URL」即可，sync 既有路徑不變。
//   2. magic link URL 從**最新 active wiki_tokens row** 抓（multi-use OK），組成 URL 帶在 content
//      裡。如無 active token，URL 不帶 ?t=（老大點開後 webapp 顯示「token 過期，叫秘書長重發」）。
//   3. chat_messages canonical 規則（reference_chat_db_canonical）：
//      - sender / recipient 全小寫白名單
//      - channel_id 字母排序+pipe（boss|<owner>）
//   4. 訊息格式：「[Wiki] {action_type} on {target_page} - {decision_layer} - {url}」
//      告知層 (auto_pending) **不在 submit 時推**，等 worker 動完 status 升 applied_pending_ack 才推。
//      要問層 (pending_review) submit 時就推。
//      Phase 1e endpoint 端只負責「要問層 submit + 老大決策後（reject/ack/rollback）」推；
//      告知層的 worker 端 push 留給 P1-5 worker 啟用時補。
//
// 用法：
//   import { notifyBossOfPendingReview } from "@/lib/telegram-notify";
//   await notifyBossOfPendingReview({ warId, actionType, targetPage, owner, justification });

import { and, gt, isNull, desc } from "drizzle-orm";
import { wikiTokens } from "@/lib/db/schema";
import { db, getTursoClient } from "@/lib/turso";
import { signToken, type TokenPayload } from "@/lib/wiki-hmac";

// ============================================================================
// Constants
// ============================================================================

/** chat_messages canonical：白名單成員（reference_chat_db_canonical）*/
const VALID_PARTICIPANTS = new Set([
  "boss",
  "forge",
  "grant",
  "lego",
  "lens",
  "mika",
  "sherlock",
  "vault",
  "waffles",
  "yuki",
  "secretary",
]);

function getBaseUrl(): string {
  const explicit = process.env.MEMORY_WEBAPP_BASE_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.length > 0) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** canonical channel_id：字母排序+pipe（兩端強制小寫） */
export function makePrivateChannelId(a: string, b: string): string {
  const lo = [a, b].map((s) => s.trim().toLowerCase()).sort();
  return lo.join("|");
}

// ============================================================================
// Token URL builder
// ============================================================================

/**
 * 取得最新 active token（exp > now AND revoked_at IS NULL），重用同一 token。
 * 不存在則回傳 null（caller 組 URL 時 fallback 不帶 ?t=）。
 *
 * Phase 1e 直接 query DB 簽 token；Phase 1f worker 上線時可考慮快取（但
 * cold start lambda 重 query 不貴，Phase 1 不優化）。
 */
export async function getActiveTokenString(): Promise<string | null> {
  const now = Date.now();
  const rows = await db
    .select()
    .from(wikiTokens)
    .where(and(gt(wikiTokens.expiresAt, now), isNull(wikiTokens.revokedAt)))
    .orderBy(desc(wikiTokens.expiresAt))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  const payload: TokenPayload = {
    tid: row.id,
    iss: row.issuedAt,
    exp: row.expiresAt,
    sub: "boss",
  };
  return signToken(payload);
}

/**
 * 組 magic link URL（指向特定 war 詳情頁或 list）。
 * 如無 active token，URL 不帶 ?t=（老大點進去會看到 401，需要叫秘書長重發 token）。
 *
 * Phase 1f (P2-NEW-1 by Forge — Lens 1e 機會點)：
 *   getActiveTokenString() 回 null 時，console.error 一筆讓 secretary 從 Vercel
 *   function log 知道要重發 token。原本靜默 fallback 老大會看到無權限頁面但
 *   程式不告警 — 這是 UX 問題不是安全問題（P2 嚴重度）。
 */
export async function buildMagicLinkUrl(
  warId?: number,
): Promise<string> {
  const base = getBaseUrl();
  const path = warId !== undefined ? `/wiki/${warId}` : `/wiki`;
  const token = await getActiveTokenString();
  if (!token) {
    const ctx = warId !== undefined ? `war ${warId}` : "list view";
    console.error(
      `[telegram-notify] no active token for magic link (${ctx}); URL will lack ?t= — secretary must reissue token.`,
    );
    return `${base}${path}`;
  }
  return `${base}${path}?t=${encodeURIComponent(token)}`;
}

// ============================================================================
// chat_messages writer (Turso)
// ============================================================================

/**
 * Sanitize chat_messages content：
 *   Lens 1e P3-NEW-4：reject_reason / rollback_reason 等 user-controlled 字串可能
 *   含 control char（NUL / BEL / ESC 等）造成 telegram bot render 混亂。
 *   規範：移除 U+0000-U+0008 / U+000B-U+001F / U+007F；保留 \n (U+000A) — telegram
 *   支援換行，老大要的格式有 \n。
 */
// eslint-disable-next-line no-control-regex
const CHAT_CONTROL_CHAR_RE = /[\x00-\x08\x0b-\x1f\x7f]/g;

export function sanitizeChatContent(content: string): string {
  return content.replace(CHAT_CONTROL_CHAR_RE, " ");
}

/**
 * 寫一筆 chat_messages 到 Turso。canonical 規則：
 *   - sender / recipient 強制小寫 + 白名單檢查（fail-loud）
 *   - channel_id 字母排序+pipe
 *   - content sanitize 控制字元（保留 \n，移除 NUL/BEL/ESC 等）
 *
 * Vercel 寫到 Turso 後，本機 sync-all 拉到 SQLite → telegram bot 推老大。
 *
 * @returns 寫入是否成功（不丟錯，給 caller 決定要不要中斷主流程）
 */
export async function writeChatMessage(args: {
  sender: string;
  recipient: string;
  content: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sender = args.sender.trim().toLowerCase();
  const recipient = args.recipient.trim().toLowerCase();

  if (!VALID_PARTICIPANTS.has(sender)) {
    return { ok: false, reason: `invalid_sender: ${sender}` };
  }
  if (!VALID_PARTICIPANTS.has(recipient)) {
    return { ok: false, reason: `invalid_recipient: ${recipient}` };
  }
  if (!args.content || typeof args.content !== "string" || args.content.length === 0) {
    return { ok: false, reason: "empty_content" };
  }

  // Lens 1e P3-NEW-4：sanitize control chars (留 \n)
  const safeContent = sanitizeChatContent(args.content);
  // sanitize 後若空（極端 case），擋掉
  if (safeContent.trim().length === 0) {
    return { ok: false, reason: "content_only_control_chars" };
  }

  const channelId = makePrivateChannelId(sender, recipient);
  const now = new Date().toISOString();

  try {
    const client = getTursoClient();
    await client.execute({
      sql: `INSERT INTO chat_messages (channel_id, sender, recipient, content, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [channelId, sender, recipient, safeContent, now],
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `db_insert_failed: ${msg}` };
  }
}

// ============================================================================
// 高階 helper：要問層 submit 時 push 老大
// ============================================================================

/**
 * 要問層 (pending_review) submit 時，寫一筆 chat_messages 給 boss inbox。
 * 走 sender=<owner>, recipient=boss → channel_id = boss|<owner>。
 * 本機 sync-all 拉到後，telegram bot 推老大。
 */
export async function notifyBossOfPendingReview(args: {
  warId: number;
  actionType: string;
  targetPage: string;
  owner: string;
  justification?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const url = await buildMagicLinkUrl(args.warId);
  const justNote = args.justification ? `\n理由：${args.justification.slice(0, 200)}` : "";
  const content =
    `[Wiki][要問] ${args.actionType} on ${args.targetPage} - review` +
    `${justNote}\n批准看：${url}`;
  const r = await writeChatMessage({
    sender: args.owner,
    recipient: "boss",
    content,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true };
}

/**
 * 告知層 worker 動完後，寫一筆 chat_messages 給 boss inbox（worker 啟用後才用）。
 * Phase 1e 不主動呼叫，留給 P1-5 worker 整合。
 */
export async function notifyBossOfAppliedPendingAck(args: {
  warId: number;
  actionType: string;
  targetPage: string;
  owner: string;
  whatChanged?: string | null;
  whyChanged?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const url = await buildMagicLinkUrl(args.warId);
  const what = args.whatChanged ? `\n做了：${args.whatChanged.slice(0, 200)}` : "";
  const why = args.whyChanged ? `\n為什麼：${args.whyChanged.slice(0, 200)}` : "";
  const content =
    `[Wiki][告知] ${args.actionType} on ${args.targetPage} - notify` +
    `${what}${why}\n看 diff：${url}`;
  const r = await writeChatMessage({
    sender: args.owner,
    recipient: "boss",
    content,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true };
}

/**
 * 老大決策後（approve/reject/ack/rollback）寫一筆 chat_messages 給 owner inbox。
 * 用 sender=boss, recipient=<owner> → channel_id = boss|<owner>。
 */
export async function notifyOwnerOfDecision(args: {
  owner: string;
  content: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const r = await writeChatMessage({
    sender: "boss",
    recipient: args.owner,
    content: args.content,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true };
}
