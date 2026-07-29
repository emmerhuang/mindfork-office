import { describe, it, expect } from "vitest";
import {
  DETECT_STATUS_KEYS,
  detectSql,
  fetchStatusGated,
  statusKeyList,
} from "./detect";

/**
 * 兩段式閘門（server 端強制）與偵測 SQL 的 key 範圍。
 *
 * 為什麼閘門一定在 server：/api/status 一被打，完整 batch 的 679 列就已經在
 * Turso 讀掉了。client 拿到 JSON 再比對是「付完錢才決定不買」。所以短路必須
 * 發生在跑完整 batch 之前，也就是 fetchStatusGated 裡。
 *
 * 實測列數（2026-07-28 對正式 Turso，只有 SELECT）：
 *   cheap detect  =  45 列
 *   完整 batch    = 679 列（mindfork_status 17 + chat_channels 34 + chat_messages 628）
 * 以下計數測試用這兩個常數當假 transport 的回報值。
 *
 * ⚠ 2026-07-29 起 chat 相關查詢已隨私聊拆除移除（老大 #13857-13859），所以正式庫的
 *   真實列數會比上面那個 679 低。**這裡刻意不改那兩個數字**：它們在本檔的角色是
 *   「假 transport 的回報值」，用來驗「沒變就不撈」這個決策，不是在斷言正式庫現在幾列。
 *   要重新量真實列數是另一件事（需要對正式庫實跑），不在本次減法的範圍。
 */

const DETECT_ROWS = 45;
const FULL_ROWS = 679;

/** 會計數的假 transport：記錄呼叫次數與累計 rows_read */
function makeCountingDeps(fingerprints: string[]) {
  let i = 0;
  const counts = { detect: 0, full: 0, rowsRead: 0 };
  const deps = {
    detect: async () => {
      const fp = fingerprints[Math.min(i, fingerprints.length - 1)];
      i += 1;
      counts.detect += 1;
      counts.rowsRead += DETECT_ROWS;
      return fp;
    },
    full: async () => {
      counts.full += 1;
      counts.rowsRead += FULL_ROWS;
      return { payload: "full" };
    },
  };
  return { deps, counts };
}

describe("detectSql — 偵測範圍只涵蓋畫面真的會用到的 key", () => {
  it("六個展示 key 全在 DETECT_STATUS_KEYS 裡", () => {
    expect([...DETECT_STATUS_KEYS].sort()).toEqual(
      ["meeting", "member_os", "member_profiles", "members", "metrics", "task_queue"]
    );
  });

  it("mindfork_status 的 MAX 必須帶 WHERE key IN（不得對全表取 MAX）", () => {
    const sql = detectSql();
    // 反向鎖：把 WHERE key IN 拿掉就會轉紅
    expect(sql).toMatch(/FROM mindfork_status WHERE key IN \(/);
    for (const k of DETECT_STATUS_KEYS) {
      expect(sql).toContain(`'${k}'`);
    }
  });

  it("偵測 SQL 不涵蓋與畫面無關的 key（rate_limit / layout / conv_bar_settings / chat_summaries）", () => {
    const sql = detectSql();
    // 正式庫實查（2026-07-28）：mindfork_status 12 個 key，其中 6 個與畫面無關。
    // 任何一個混進來都會偽造出「有變」、逼出一次 679 列的 full fetch。
    for (const k of [
      "rate_limit",
      "layout",
      "conv_bar_settings",
      "chat_summaries",
    ]) {
      expect(sql).not.toContain(`'${k}'`);
    }
  });

  it("statusKeyList() 產出的字面清單可直接嵌入 SQL（三處共用同一份 key 定義）", () => {
    expect(statusKeyList()).toBe(
      "'metrics', 'members', 'member_os', 'task_queue', 'meeting', 'member_profiles'"
    );
  });

  it("🔴 偵測 SQL 不再碰 chat 表（drop chat_messages 的前提；私聊已整條拆除）", () => {
    const sql = detectSql();
    expect(sql).not.toContain("chat_channels");
    expect(sql).not.toContain("chat_messages");
  });

  it("反方向：mindfork_status 這個訊號仍在（減法不得把該留的一起弄丟）", () => {
    expect(detectSql()).toContain("FROM mindfork_status");
  });
});

describe("fetchStatusGated — 沒變就不撈重查詢", () => {
  it("首次（lastFingerprint 為空）→ 一定跑 full", async () => {
    const { deps, counts } = makeCountingDeps(["fpA"]);
    const r = await fetchStatusGated("", deps);
    expect(r.unchanged).toBe(false);
    expect(counts.full).toBe(1);
    expect(r.fingerprint).toBe("fpA");
  });

  it("fingerprint 相同 → 不跑 full、回 unchanged", async () => {
    const { deps, counts } = makeCountingDeps(["fpA"]);
    const r = await fetchStatusGated("fpA", deps);
    expect(r.unchanged).toBe(true);
    expect(counts.full).toBe(0);
    expect(counts.detect).toBe(1);
  });

  it("fingerprint 不同 → 跑 full 並帶回資料", async () => {
    const { deps, counts } = makeCountingDeps(["fpB"]);
    const r = await fetchStatusGated("fpA", deps);
    expect(r.unchanged).toBe(false);
    if (r.unchanged === false) expect(r.data).toEqual({ payload: "full" });
    expect(counts.full).toBe(1);
  });

  it("正面計數：20 輪都沒變 → full 呼叫 0 次、累計 900 列", async () => {
    const { deps, counts } = makeCountingDeps(["fpA"]);
    let last = "fpA";
    for (let n = 0; n < 20; n++) {
      const r = await fetchStatusGated(last, deps);
      last = r.fingerprint;
    }
    expect(counts.detect).toBe(20);
    expect(counts.full).toBe(0);
    expect(counts.rowsRead).toBe(20 * DETECT_ROWS); // 900
  });

  it("正面計數：20 輪中第 7 輪變一次 → full 呼叫 1 次、累計 1579 列", async () => {
    const fps = Array.from({ length: 20 }, (_, n) => (n < 6 ? "fpA" : "fpB"));
    const { deps, counts } = makeCountingDeps(fps);
    let last = "fpA";
    for (let n = 0; n < 20; n++) {
      const r = await fetchStatusGated(last, deps);
      last = r.fingerprint;
    }
    expect(counts.detect).toBe(20);
    expect(counts.full).toBe(1);
    expect(counts.rowsRead).toBe(20 * DETECT_ROWS + FULL_ROWS); // 1579
  });

  it("對照組（無閘門的舊行為）：20 輪都跑 full = 13580 列", () => {
    // 這條不呼叫 fetchStatusGated，只把「改前」的量級寫成可比對的常數，
    // 讓上面兩條的節省幅度在測試檔裡就看得到出處。
    expect(20 * FULL_ROWS).toBe(13580);
  });

  it("detect 失敗 → 例外往上拋，不得靜默回 unchanged（否則畫面會永遠停更）", async () => {
    const deps = {
      detect: async () => {
        throw new Error("turso down");
      },
      full: async () => ({ payload: "full" }),
    };
    await expect(fetchStatusGated("fpA", deps)).rejects.toThrow("turso down");
  });
});
