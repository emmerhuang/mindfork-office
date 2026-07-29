// lib/telegram-notify.ts — 老大通知寫入端（Vercel 側）
//
// 2026-07-29 Forge 改寫：通知從 Turso `chat_messages` 搬到專用的 `boss_notifications`
// （migration turso-006）。背景是老大 #13857-13859 拆掉私聊整條路、chat_messages 要 DROP。
//
// ============================================================================
// 為什麼 Vercel 端只能寫 DB、不能自己推 Telegram
// ============================================================================
// mindfork-office 跑在 Vercel，而**雲端刻意不放 Telegram bot 憑證**（既有決策：
// 通知由本機發、雲端零 bot 憑證）。所以「要問層送出要通知老大」只能寫進 Turso，
// 由本機的 puller 撈到、用本機的 bot 推。
//
// 這不是繞路，是憑證邊界的必然結果。也因此這張表是一個**單向 outbox**：
// 只有一個收件人（老大），沒有對話、沒有 sender/recipient、沒有 channel。
//
// ============================================================================
// ⚠ 搬家時修正的一句假話
// ============================================================================
// 舊版檔頭寫著「Vercel 寫 Turso chat_messages → 本機 sync-all 拉到本機 SQLite
// → 本機 telegram bot 推老大」。**那條路不存在**：sync-all 的 sync_chat_messages()
// 只有本機→雲端單向，全庫沒有任何 Turso→本機的 puller。
// 也就是說這個模組寫出去的通知，從落地那天起就沒有任何讀者。
// （同型病灶：check-worker-daemon 的告警寫雲端而讀者在本機，五個月從未到達。）
//
// 讀取端因此是**新建**的，不是改既有的：
//   C:\MySecretary\scripts\boss_notifications_pull.py
//
// ============================================================================
// 刻意沒有搬過來的東西
// ============================================================================
// ‧ VALID_PARTICIPANTS 白名單、makePrivateChannelId、writeChatMessage
//   → 都是「兩個對話端點」的私聊語意。這張表只有一個收件人，留著等於把
//     要拆掉的概念換個地方活下來。
// ‧ notifyOwnerOfDecision（通知成員「老大 reject 了你的提議」）
//   → 它的收件人是成員、靠私聊 inbox 送達，而那個 inbox 已不存在（且雲端→本機
//     的同步從來沒有過 ⟹ 它也從未送達過任何人）。成立前提被打掉，一併移除。
//     ⚠ 若日後真要讓成員收到決策結果，那需要另設一條通道，不是把這支接回來。
//     決策本身的durable紀錄仍在 wiki_action_requests.status，沒有因此丟失。
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

/** 這個服務在 boss_notifications.source 裡的名字。 */
const SOURCE = "mindfork-office";

/**
 * content 上限。對齊 turso-006 的 CHECK (length(content) BETWEEN 1 AND 4000)。
 * 超長時截短而不是整則丟掉：一則被截短的通知仍然告訴老大「有事要看」，
 * 而丟掉就是靜默漏送（DB 的 CHECK 會擋下整句 INSERT，只剩一行沒人看的 log）。
 */
const CONTENT_MAX = 4000;

/**
 * 截短時附在尾端的記號。
 *
 * 為什麼需要它：無聲截短會讓老大讀到一則**看起來完整但其實被切掉**的通知，
 * 而他無法分辨「本來就這麼短」與「後面還有東西」。這跟顯示未驗證的成功是同一類
 * 問題 —— 畫面說的話比實際情況樂觀。加一句記號讓他知道要去看連結。
 */
const TRUNCATED_MARK = "\n…（內容過長已截短，完整內容請看上面的連結）";

/** justification / whatChanged 等自由文字在 content 裡的截斷長度。 */
const NOTE_MAX = 200;

function getBaseUrl(): string {
  const explicit = process.env.MEMORY_WEBAPP_BASE_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.length > 0) return `https://${vercel}`;
  return "http://localhost:3000";
}

// ============================================================================
// Token URL builder（未變動）
// ============================================================================

/**
 * 取得最新 active token（exp > now AND revoked_at IS NULL），重用同一 token。
 * 不存在則回傳 null（caller 組 URL 時 fallback 不帶 ?t=）。
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
 * 如無 active token，URL 不帶 ?t=，並 console.error 一筆讓 secretary 從 Vercel
 * function log 知道要重發 token（否則老大點進去只會看到無權限頁面而程式不告警）。
 */
export async function buildMagicLinkUrl(warId?: number): Promise<string> {
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
// boss_notifications writer (Turso)
// ============================================================================

/**
 * 移除控制字元、保留 \n。
 *
 * 這道處理原本叫 sanitizeChatContent（Lens 1e P3-NEW-4 加的）：reject_reason /
 * rollback_reason 等 user-controlled 字串可能含 NUL / BEL / ESC，造成 telegram bot
 * render 混亂。**這個前提沒有被本次改動打掉**，所以處理照留，只是名字裡的 "Chat"
 * 已經沒有對應的東西了，改成 Notification。
 *
 * 規範：移除 U+0000-U+0008 / U+000B-U+001F / U+007F；保留 \n (U+000A)。
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0b-\x1f\x7f]/g;

export function sanitizeNotificationContent(content: string): string {
  return content.replace(CONTROL_CHAR_RE, " ");
}

/**
 * 寫一筆 boss_notifications 到 Turso。
 *
 * 刻意**不**寫 delivery_state / delivered_at / attempt_count：那三欄是投遞狀態，
 * 由 DB default（pending / NULL / 0）與本機 puller 負責。寫入端插手就會造出
 * 「雲端說已送達、其實沒人推過」的假狀態。
 *
 * @returns 寫入是否成功（不丟錯，給 caller 決定要不要中斷主流程）
 */
export async function writeBossNotification(args: {
  source: string;
  kind: string;
  ref: string | null;
  content: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const source = args.source.trim();
  const kind = args.kind.trim();

  // source / kind 是 DB NOT NULL。在這裡擋掉比讓 DB 丟一句 SQL 錯誤清楚，
  // 而且 reason 會進 Vercel function log，查起來知道是哪一種問題。
  if (source.length === 0) return { ok: false, reason: "empty_source" };
  if (kind.length === 0) return { ok: false, reason: "empty_kind" };

  if (!args.content || typeof args.content !== "string" || args.content.length === 0) {
    return { ok: false, reason: "empty_content" };
  }

  const safe = sanitizeNotificationContent(args.content);
  // sanitize 後若只剩空白：空的通知推給老大只會是一則謎題，擋掉。
  if (safe.trim().length === 0) {
    return { ok: false, reason: "content_only_control_chars" };
  }
  // 超長截短（見 CONTENT_MAX 註解：截短優於靜默漏送）。
  // 截短時附記號，且要保證「本體 + 記號」總長仍在上限內，否則 DB CHECK 會擋。
  const content =
    safe.length > CONTENT_MAX
      ? safe.slice(0, CONTENT_MAX - TRUNCATED_MARK.length) + TRUNCATED_MARK
      : safe;

  const ref = args.ref && args.ref.trim().length > 0 ? args.ref.trim() : null;
  const now = new Date().toISOString();

  try {
    const client = getTursoClient();
    await client.execute({
      sql: `INSERT INTO boss_notifications (source, kind, ref, content, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [source, kind, ref, content, now],
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `db_insert_failed: ${msg}` };
  }
}

// ============================================================================
// 高階 helper
// ============================================================================

/**
 * 要問層 (pending_review) submit 時，寫一筆通知給老大。
 *
 * ⚠ owner 進 content 而不是進某個欄位：舊版靠 chat_messages.sender 表達「誰提的」，
 *   新表沒有 sender（單向 outbox），所以這個資訊必須寫在 content 裡，
 *   否則搬家等於把「誰提的」弄丟。
 */
export async function notifyBossOfPendingReview(args: {
  warId: number;
  actionType: string;
  targetPage: string;
  owner: string;
  justification?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const url = await buildMagicLinkUrl(args.warId);
  const justNote = args.justification
    ? `\n理由：${args.justification.slice(0, NOTE_MAX)}`
    : "";
  const content =
    `[Wiki][要問] ${args.actionType} on ${args.targetPage}` +
    `\n提出者：${args.owner}` +
    `${justNote}\n批准看：${url}`;
  const r = await writeBossNotification({
    source: SOURCE,
    kind: "pending_review",
    ref: `war:${args.warId}`,
    content,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true };
}

/**
 * 告知層 worker 動完後，寫一筆通知給老大。
 *
 * ⚠ 目前 mindfork-office 端沒有呼叫者（worker 跑在本機、見
 *   C:\MySecretary\scripts\wiki\agent-worker.py）。保留是因為 Vercel 端若接手
 *   worker 職責時需要它，而且它與 pending_review 共用同一張表與同一組守衛。
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
  const what = args.whatChanged ? `\n做了：${args.whatChanged.slice(0, NOTE_MAX)}` : "";
  const why = args.whyChanged ? `\n為什麼：${args.whyChanged.slice(0, NOTE_MAX)}` : "";
  const content =
    `[Wiki][告知] ${args.actionType} on ${args.targetPage}` +
    `\n執行者：${args.owner}` +
    `${what}${why}\n看 diff：${url}`;
  const r = await writeBossNotification({
    source: SOURCE,
    kind: "applied_pending_ack",
    ref: `war:${args.warId}`,
    content,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true };
}
