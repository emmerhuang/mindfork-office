/**
 * 對**真實 Turso dev 庫**的整合測試（不是 mock）。
 *
 * 為什麼需要這一層：單元測試把 @/lib/turso 換成假的，它證明的是「我們組出了正確的
 * SQL」，證明不了「libSQL over HTTP 真的吃這句 SQL、CHECK 真的擋得住」。
 * harness 的行為與 libsql/trigger 不一致是踩過的坑，所以要有一層打真的。
 *
 * 跑法（憑證不落檔、從環境變數帶入）：
 *   BOSS_NOTIF_DEV_URL=... BOSS_NOTIF_DEV_TOKEN=... npx vitest run \
 *     src/lib/boss-notifications.integration.test.ts
 *
 * 沒帶環境變數時整組 skip ⟹ `npm test` 不會因為缺憑證而紅，也不會偷偷打到任何庫。
 *
 * ⚠ 只准打 dev：下面有 hostname 斷言，URL 不含 '-dev-' 就整組 skip 並失敗一條，
 *   避免有人把 prod 憑證塞進來。
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createClient, type Client } from "@libsql/client/web";

const URL_ = process.env.BOSS_NOTIF_DEV_URL ?? "";
const TOKEN = process.env.BOSS_NOTIF_DEV_TOKEN ?? "";
const enabled = URL_.length > 0 && TOKEN.length > 0;

describe.skipIf(!enabled)("boss_notifications — 真實 dev Turso", () => {
  let client: Client;
  const created: number[] = [];

  beforeAll(() => {
    // 環境斷言：這組測試會寫資料，只准寫 dev
    expect(URL_).toContain("-dev-");
    // 第二道獨立守衛：與 prod URL 逐字比對。
    //
    // ⚠ prod hostname 刻意**不寫在原始碼裡** —— 這個 repo 是公開的，把正式庫的
    //   主機名字寫進來等於告訴外面「要拿 token 去試哪一台」。主機名本身不是憑證，
    //   但沒有理由白送。所以改成從環境變數帶入，設了才比。
    //
    // 為什麼還要留這道（上面那條 '-dev-' 已經排除 prod）：兩道守衛的失效方式不同。
    // 若日後有人放寬 '-dev-' 那條（例如改成 includes("dev")），這道仍然擋得住。
    const prodUrl = process.env.BOSS_NOTIF_PROD_URL ?? "";
    if (prodUrl.length > 0) {
      expect(URL_).not.toBe(prodUrl);
    }
    client = createClient({ url: URL_, authToken: TOKEN });
  });

  afterAll(async () => {
    // 自己造的列自己清（具名 id，不用條件式刪）
    for (const id of created) {
      await client.execute({
        sql: "DELETE FROM boss_notifications WHERE id = ?",
        args: [id],
      });
    }
  });

  async function insert(content: string, kind = "pending_review", ref: string | null = null) {
    const r = await client.execute({
      sql: `INSERT INTO boss_notifications (source, kind, ref, content, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ["mindfork-office", kind, ref, content, new Date().toISOString()],
    });
    const id = Number(r.lastInsertRowid);
    created.push(id);
    return id;
  }

  it("INSERT 走得通，且預設狀態是 pending（DB default 生效）", async () => {
    const id = await insert("整合測試 — 預設狀態", "pending_review", "war:9001");
    const r = await client.execute({
      sql: "SELECT delivery_state, delivered_at, attempt_count, last_error "
        + "FROM boss_notifications WHERE id = ?",
      args: [id],
    });
    expect(r.rows[0].delivery_state).toBe("pending");
    expect(r.rows[0].delivered_at).toBeNull();
    expect(Number(r.rows[0].attempt_count)).toBe(0);
    expect(r.rows[0].last_error).toBeNull();
  });

  it("狀態機 CHECK 在真 libSQL 上真的擋得住（failed 卻沒 last_error）", async () => {
    await expect(
      client.execute({
        sql: `INSERT INTO boss_notifications
              (source, kind, content, created_at, delivery_state, attempt_count, last_attempt_at)
              VALUES ('mindfork-office','pending_review','x',?, 'failed', 1, ?)`,
        args: [new Date().toISOString(), new Date().toISOString()],
      }),
    ).rejects.toThrow();
  });

  it("狀態機 CHECK 擋得住 delivered 卻沒 delivered_at", async () => {
    await expect(
      client.execute({
        sql: `INSERT INTO boss_notifications
              (source, kind, content, created_at, delivery_state, attempt_count, last_attempt_at)
              VALUES ('mindfork-office','pending_review','x',?, 'delivered', 1, ?)`,
        args: [new Date().toISOString(), new Date().toISOString()],
      }),
    ).rejects.toThrow();
  });

  it("trigger T1 在真 libSQL 上真的擋得住（delivered 是終態）", async () => {
    const id = await insert("整合測試 — T1");
    const ts = new Date().toISOString();
    await client.execute({
      sql: "UPDATE boss_notifications SET delivery_state='delivered', delivered_at=?, "
        + "attempt_count=1, last_attempt_at=?, last_error=NULL WHERE id=?",
      args: [ts, ts, id],
    });
    await expect(
      client.execute({
        sql: "UPDATE boss_notifications SET delivery_state='failed', delivered_at=NULL, "
          + "last_error='x' WHERE id=?",
        args: [id],
      }),
    ).rejects.toThrow(/delivered is terminal/);
  });

  it("trigger T3 在真 libSQL 上真的擋得住（content 不可改）", async () => {
    const id = await insert("整合測試 — T3");
    await expect(
      client.execute({
        sql: "UPDATE boss_notifications SET content='改掉' WHERE id=?",
        args: [id],
      }),
    ).rejects.toThrow(/immutable/);
  });

  it("content 超過 4000 字被 DB 擋（寫入端的截短不是唯一防線）", async () => {
    await expect(
      client.execute({
        sql: `INSERT INTO boss_notifications (source, kind, content, created_at)
              VALUES ('mindfork-office','pending_review',?,?)`,
        args: ["字".repeat(4001), new Date().toISOString()],
      }),
    ).rejects.toThrow();
  });
});
