/**
 * telegram-notify — 老大通知寫入端（2026-07-29 Forge，拆私聊最後一步）
 *
 * 這個模組原本把通知寫進 Turso `chat_messages`，走「sender=<owner>, recipient=boss」
 * 的私聊語意。私聊整條路已拆除（老大 #13857-13859），而 chat_messages 要被 DROP，
 * 所以通知改寫進專用的 `boss_notifications`。
 *
 * 🔴 本檔的核心職責是**兩個方向都鎖**：
 *    ‧ 正方向：通知真的寫進 boss_notifications，內容與回傳形狀不變（呼叫端不必動）
 *    ‧ 反方向：私聊的概念不得換個地方活下來 —— SQL 不許再出現 chat_messages /
 *      channel_id / sender / recipient，模組不許再 export 私聊語意的東西
 *    只鎖前者，下一個人會把整段改回去而測試依然全綠。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ execute: vi.fn() }));

// db 只被 getActiveTokenString() 用（查 active wiki_tokens）。這裡固定回空陣列
// ⟹ 走「無 active token」的 URL fallback 分支，測試不必準備 HMAC secret。
vi.mock("@/lib/turso", () => ({
  getTursoClient: () => ({ execute: h.execute }),
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => [] as unknown[] }),
        }),
      }),
    }),
  },
}));

import * as mod from "@/lib/telegram-notify";
import {
  notifyBossOfAppliedPendingAck,
  notifyBossOfPendingReview,
  sanitizeNotificationContent,
} from "@/lib/telegram-notify";

/** 取最後一次 INSERT 的 { sql, args }。 */
function lastCall(): { sql: string; args: unknown[] } {
  expect(h.execute).toHaveBeenCalled();
  const arg = h.execute.mock.calls.at(-1)![0] as { sql: string; args: unknown[] };
  return arg;
}

beforeEach(() => {
  h.execute.mockReset();
  // 不放 lastInsertRowid：寫入端不讀它，而 BigInt literal 在本專案的
  // tsconfig target（< ES2020）下會讓 tsc 報 TS2737。
  h.execute.mockResolvedValue({ rowsAffected: 1 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("notifyBossOfPendingReview — 正方向", () => {
  const base = {
    warId: 42,
    actionType: "edit_page",
    targetPage: "wiki/foo.md",
    owner: "forge",
  };

  it("寫進 boss_notifications（不是 chat_messages）", async () => {
    const r = await notifyBossOfPendingReview(base);
    expect(r).toEqual({ ok: true });
    expect(lastCall().sql).toContain("INSERT INTO boss_notifications");
  });

  it("source / kind / ref 三個欄位都帶對", async () => {
    await notifyBossOfPendingReview(base);
    const { sql, args } = lastCall();
    // 欄位順序以 SQL 為準，用欄位名找出 args 位置，不硬記 index
    const cols = sql
      .slice(sql.indexOf("(") + 1, sql.indexOf(")"))
      .split(",")
      .map((s) => s.trim());
    expect(args[cols.indexOf("source")]).toBe("mindfork-office");
    expect(args[cols.indexOf("kind")]).toBe("pending_review");
    expect(args[cols.indexOf("ref")]).toBe("war:42");
  });

  it("content 保留原本給老大的資訊：動作、目標頁、批准連結", async () => {
    await notifyBossOfPendingReview(base);
    const content = String(lastCall().args.find((a) => String(a).includes("edit_page")));
    expect(content).toContain("edit_page");
    expect(content).toContain("wiki/foo.md");
    expect(content).toContain("/wiki/42");
  });

  it("content 帶得出提出者是誰", async () => {
    // 原本「誰提的」靠 chat_messages.sender 表達；新表沒有 sender 欄，
    // 所以這個資訊必須進 content，否則搬家等於把資訊弄丟。
    await notifyBossOfPendingReview(base);
    const content = String(lastCall().args.find((a) => String(a).includes("edit_page")));
    expect(content).toContain("forge");
  });

  it("justification 截到 200 字，不讓長理由擠爆訊息", async () => {
    await notifyBossOfPendingReview({ ...base, justification: "宀".repeat(500) });
    const content = String(lastCall().args.find((a) => String(a).includes("edit_page")));
    expect(content).toContain("宀".repeat(200));
    expect(content).not.toContain("宀".repeat(201));
  });

  it("寫入端不自己決定投遞狀態", async () => {
    // delivery_state / delivered_at / attempt_count 由 DB default 與本機 puller 管。
    // 寫入端插手就會產生「雲端說已送達、其實沒人推過」的假狀態。
    const { sql } = (await notifyBossOfPendingReview(base), lastCall());
    expect(sql).not.toContain("delivery_state");
    expect(sql).not.toContain("delivered_at");
    expect(sql).not.toContain("attempt_count");
  });

  it("DB 失敗回 ok:false 帶原因，不丟錯（呼叫端主流程不該被通知失敗打斷）", async () => {
    h.execute.mockRejectedValueOnce(new Error("boom"));
    const r = await notifyBossOfPendingReview(base);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("boom");
  });

});

describe("writeBossNotification — 通用寫入端的守衛", () => {
  // 為什麼直接測這一層：空內容的守衛從 notifyBossOfPendingReview 走不到
  // （它的 content 一定帶固定前綴）。只透過高階函式測，等於讓那個守衛
  // 永遠不被驗證 —— 那就是一段沒人量過的程式。
  const base = { source: "mindfork-office", kind: "pending_review", ref: null };

  it("content 空字串 → ok:false，且完全不打 DB", async () => {
    const r = await mod.writeBossNotification({ ...base, content: "" });
    expect(r.ok).toBe(false);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it("content 只有控制字元（sanitize 後變空）→ ok:false，且不打 DB", async () => {
    // 空的通知推給老大只會是一則謎題，寧可在寫入端擋住並留下 reason。
    const r = await mod.writeBossNotification({ ...base, content: "\x00\x07\x1b\x7f" });
    expect(r.ok).toBe(false);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it("source / kind 空白 → ok:false（這兩欄是 DB NOT NULL，先擋比讓 DB 丟錯清楚）", async () => {
    expect((await mod.writeBossNotification({ ...base, source: "", content: "x" })).ok).toBe(false);
    expect((await mod.writeBossNotification({ ...base, kind: " ", content: "x" })).ok).toBe(false);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it("content 超過 4000 字被截短（DB CHECK 上限，截短比整則丟掉好）", async () => {
    const r = await mod.writeBossNotification({ ...base, content: "字".repeat(5000) });
    expect(r.ok).toBe(true);
    const content = String(lastCall().args.find((a) => String(a).startsWith("字")));
    expect(content.length).toBeLessThanOrEqual(4000);
  });

  it("截短時留記號，不無聲切掉", async () => {
    // 無聲截短讓老大讀到一則「看起來完整但其實被切掉」的通知，
    // 而他無法分辨「本來就這麼短」與「後面還有東西」。
    const r = await mod.writeBossNotification({ ...base, content: "字".repeat(5000) });
    expect(r.ok).toBe(true);
    const content = String(lastCall().args.find((a) => String(a).startsWith("字")));
    expect(content).toContain("已截短");
  });

  it("剛好在上限內的內容不加記號、也不被動到", async () => {
    // 反方向：截短邏輯不得誤傷沒超長的內容
    const exact = "字".repeat(4000);
    const r = await mod.writeBossNotification({ ...base, content: exact });
    expect(r.ok).toBe(true);
    const content = String(lastCall().args.find((a) => String(a).startsWith("字")));
    expect(content).toBe(exact);
    expect(content).not.toContain("已截短");
  });
});

describe("notifyBossOfAppliedPendingAck", () => {
  it("也寫 boss_notifications，kind 區分得出來", async () => {
    const r = await notifyBossOfAppliedPendingAck({
      warId: 7,
      actionType: "append_section",
      targetPage: "wiki/bar.md",
      owner: "vault",
    });
    expect(r).toEqual({ ok: true });
    const { sql, args } = lastCall();
    expect(sql).toContain("INSERT INTO boss_notifications");
    const cols = sql
      .slice(sql.indexOf("(") + 1, sql.indexOf(")"))
      .split(",")
      .map((s) => s.trim());
    expect(args[cols.indexOf("kind")]).toBe("applied_pending_ack");
    expect(args[cols.indexOf("ref")]).toBe("war:7");
  });
});

describe("sanitizeNotificationContent — Lens 當初加的防護不得在搬家時掉", () => {
  it("移除 NUL / BEL / ESC / DEL", async () => {
    expect(sanitizeNotificationContent("a\x00b\x07c\x1bd\x7fe")).toBe("a b c d e");
  });

  it("保留 \\n（老大要的格式有換行，telegram 支援）", async () => {
    expect(sanitizeNotificationContent("一\n二")).toBe("一\n二");
  });

  it("空字串進、空字串出（不自己補東西）", async () => {
    expect(sanitizeNotificationContent("")).toBe("");
  });

  it("真的被用在寫入路徑上，不是只 export 出來好看", async () => {
    await notifyBossOfPendingReview({
      warId: 1,
      actionType: "edit_page",
      targetPage: "p",
      owner: "forge",
      justification: "壞\x00字元",
    });
    const content = String(lastCall().args.find((a) => String(a).includes("edit_page")));
    expect(content).not.toContain("\x00");
    expect(content).toContain("壞 字元");
  });
});

describe("🔴 反方向：私聊的概念不得換個地方活下來", () => {
  const base = {
    warId: 42,
    actionType: "edit_page",
    targetPage: "wiki/foo.md",
    owner: "forge",
  };

  it("SQL 不再出現 chat_messages（DROP 那張表的前提）", async () => {
    await notifyBossOfPendingReview(base);
    expect(lastCall().sql).not.toContain("chat_messages");
  });

  it("SQL 不再有 channel_id / sender / recipient 這三個私聊欄位", async () => {
    await notifyBossOfPendingReview(base);
    const { sql } = lastCall();
    expect(sql).not.toContain("channel_id");
    expect(sql).not.toContain("sender");
    expect(sql).not.toContain("recipient");
  });

  it("模組不再 export 私聊語意的東西", async () => {
    // makePrivateChannelId / writeChatMessage 是「兩個對話端點」的概念，
    // 而這張表只有一個收件人。留著它們＝把要拆的概念換個地方活下來。
    expect(mod).not.toHaveProperty("makePrivateChannelId");
    expect(mod).not.toHaveProperty("writeChatMessage");
    expect(mod).not.toHaveProperty("sanitizeChatContent");
  });

  it("模組不再 export notifyOwnerOfDecision", async () => {
    // 它的收件人是成員、靠私聊 inbox 送達。那個 inbox 已經不存在，
    // 而且雲端→本機的同步從來就沒有過（見回報）⟹ 它的成立前提被打掉了。
    expect(mod).not.toHaveProperty("notifyOwnerOfDecision");
  });
});

describe("反方向：該留的沒被減法弄丟", () => {
  it("仍然 export 兩支老大通知與 sanitize", async () => {
    expect(typeof mod.notifyBossOfPendingReview).toBe("function");
    expect(typeof mod.notifyBossOfAppliedPendingAck).toBe("function");
    expect(typeof mod.sanitizeNotificationContent).toBe("function");
  });

  it("magic link 相關能力仍在（通知內容要帶批准連結）", async () => {
    expect(typeof mod.buildMagicLinkUrl).toBe("function");
    expect(typeof mod.getActiveTokenString).toBe("function");
  });
});
