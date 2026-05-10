// questions-notify.ts — 半寫雙錨點 chat_messages 整合（Phase 2）
//
// Phase: 2 (Forge — 新建)
// Spec  : phase2 spec D-14 + Lego ADR §B.2 / §D.4
//
// 半寫策略（D-14）：
//   - 出題錨點（submit）：owner → boss 「N 題已上 webapp」
//   - 答覆錨點（poll）：boss → owner「N 題答覆摘要 + 答覆字串」
//   - 過程不寫（按按鈕、補充說明都不進 chat_messages）
//
// 雙錨點都走既有 lib/telegram-notify.ts writeChatMessage（canonical sender/recipient
// 白名單 + channel_id 字母排序+pipe）— 不另寫 raw INSERT 避免破壞 chat_messages 慣例。
//
// 一致性策略（Lego ADR §H.1）：
//   - 錨點 1：INSERT webapp_questions × N → 寫 chat_messages（同一 endpoint，順序關鍵）
//             失敗時：webapp 已寫但 chat 沒寫 → log + 回 partial_success（caller 知道）
//   - 錨點 2：UPDATE delivered_at × N → 寫 chat_messages（同一 endpoint，順序關鍵）
//             失敗時：UPDATE 已 commit 但 chat 沒寫 → log + 回 partial_success
//             下次 polling 看不到（delivered 已標）→ chat 訊息永遠不會補（接受 trade-off）
//   - 嚴格 transactional 雙寫不可行：libSQL HTTP client 不支援跨表 transaction with rollback；
//     故採「先 webapp 後 chat + log fallback」最佳努力策略

import { writeChatMessage, makePrivateChannelId } from "@/lib/telegram-notify";
import {
  formatAnswerString,
  type QuestionListItem,
  type AnswerBatch,
} from "@/lib/questions-data";

/** chat_messages canonical 白名單（與 telegram-notify.ts VALID_PARTICIPANTS 對齊） */
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

export function isValidParticipant(name: string): boolean {
  return VALID_PARTICIPANTS.has(name.trim().toLowerCase());
}

function getBaseUrl(): string {
  const explicit = process.env.MEMORY_WEBAPP_BASE_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.length > 0) return `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * 出題錨點：owner → boss 提醒「N 題已上 webapp」。
 *
 * Lego ADR §B.2 規範：content 含 [#N] + N 題 + URL（webapp /wiki/questions list 頁）。
 * URL 不帶 token（boss 點開後由既有 magic link 機制 / admin cookie 認證）。
 *
 * @returns 寫入結果（caller 決定要不要當 partial fail）
 */
export async function notifyBossOfNewQuestions(args: {
  owner: string;
  questionIds: number[];
  questionPreviews: Pick<QuestionListItem, "id" | "questionBody">[];
}): Promise<{ ok: boolean; reason?: string; chatChannelId?: string }> {
  const owner = args.owner.trim().toLowerCase();
  if (!VALID_PARTICIPANTS.has(owner)) {
    return { ok: false, reason: `invalid_owner: ${owner}` };
  }
  const N = args.questionIds.length;
  if (N === 0) return { ok: false, reason: "empty_question_ids" };
  // 預覽：最多列 3 題標題（避免訊息過長）
  const previews = args.questionPreviews
    .slice(0, 3)
    .map((q) => `  #${q.id} ${q.questionBody.slice(0, 80)}`);
  const more = N > 3 ? `\n  ...另 ${N - 3} 題` : "";
  const url = `${getBaseUrl()}/wiki/questions`;

  const content =
    `[提問] ${owner} 上了 ${N} 題請有空時批次處理\n` +
    previews.join("\n") +
    more +
    `\n看清單：${url}`;

  const r = await writeChatMessage({
    sender: owner,
    recipient: "boss",
    content,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, chatChannelId: makePrivateChannelId(owner, "boss") };
}

/**
 * 答覆錨點：boss → owner 摘要回報「N 題答覆」。
 *
 * Lego ADR §B.2：content 含 [#N] + 每題答覆字串（option label + 補充說明摘要）。
 * 由 polling endpoint 在 mark delivered_at 之後呼叫。
 *
 * @param batches 已 group 的批次（formatBatchSummary 內逐批列出）
 */
export async function notifyOwnerOfAnswers(args: {
  owner: string;
  batches: AnswerBatch[];
}): Promise<{ ok: boolean; reason?: string }> {
  const owner = args.owner.trim().toLowerCase();
  if (!VALID_PARTICIPANTS.has(owner)) {
    return { ok: false, reason: `invalid_owner: ${owner}` };
  }
  if (args.batches.length === 0) return { ok: false, reason: "empty_batches" };

  const totalN = args.batches.reduce((sum, b) => sum + b.questions.length, 0);
  const lines: string[] = [`[提問答覆] ${totalN} 題答覆已下來`];
  for (const batch of args.batches) {
    const batchTag = batch.batchId
      ? `批次 ${batch.batchId.slice(0, 12)}`
      : "（未分批）";
    lines.push(`\n${batchTag}：`);
    for (const q of batch.questions) {
      lines.push(`  #${q.id} ${q.questionBody.slice(0, 60)}`);
      lines.push(`     → ${formatAnswerString(q)}`);
    }
  }
  const content = lines.join("\n");

  const r = await writeChatMessage({
    sender: "boss",
    recipient: owner,
    content,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true };
}

/** 純 helper — 給其他 endpoint / test 直接組摘要 */
export function formatBatchSummaryText(batches: AnswerBatch[]): string {
  const lines: string[] = [];
  for (const batch of batches) {
    const batchTag = batch.batchId
      ? `批次 ${batch.batchId.slice(0, 12)}`
      : "（未分批）";
    lines.push(`${batchTag}：`);
    for (const q of batch.questions) {
      lines.push(`  #${q.id} ${q.questionBody.slice(0, 60)} → ${formatAnswerString(q)}`);
    }
  }
  return lines.join("\n");
}

/** 純 helper — 給其他 endpoint 取 owner inbox 對應 channel id */
export function ownerBossChannelId(owner: string): string {
  return makePrivateChannelId(owner, "boss");
}

// (helpers 全部 export，由 endpoint 各自 import 使用)
