import { describe, it, expect, vi } from "vitest";
import { buildStatusUrl, pollStatusOnce } from "./useStatusStream";

/**
 * fallback 輪詢的 client 側契約。
 *
 * SSE 連續失敗 5 次後，hook 會退回每 15 秒打一次 /api/status。
 * 改動前它每次都拿完整 payload（正式庫實測 679 列）；改動後它把上一輪的
 * fingerprint 用 ?fp= 帶回去，server 先跑 cheap detect（45 列），沒變就回
 * { unchanged: true }，完全不跑完整 batch。
 *
 * 這裡鎖 client 這一側的三件事：
 *   1. fp 有帶（沒帶 = server 端閘門形同不存在）
 *   2. fp 有正確 encode（fingerprint 含 '+'，不 encode 會在 query string 被解成空白）
 *   3. unchanged 回應不得覆蓋畫面狀態、失敗不得推進 fingerprint
 */

/** 正式庫實際 fingerprint 的形狀（含 | : + 三種需要 encode 的字元） */
const REAL_FP = "status:2026-07-28T09:30:18+08:00|chat_ch:2026-06-16T03:46:42+08:00|msg_max:3308";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

describe("buildStatusUrl", () => {
  it("沒有上一輪 fingerprint（首載）→ 不帶 fp，行為與改動前相同", () => {
    expect(buildStatusUrl("")).toBe("/api/status");
  });

  it("有 fingerprint → 帶 fp query param", () => {
    expect(buildStatusUrl("fpA")).toBe("/api/status?fp=fpA");
  });

  it("fingerprint 內的 + | : 必須 encode（'+' 在 query string 會被解成空白）", () => {
    const url = buildStatusUrl(REAL_FP);
    expect(url).not.toContain("+"); // 未 encode 的 '+' 會讓 server 收到空白、永遠判定有變
    expect(url).toContain("%2B");
    expect(url).toContain("%7C");
    expect(url).toBe("/api/status?fp=" + encodeURIComponent(REAL_FP));
  });
});

describe("pollStatusOnce", () => {
  it("首輪打無 fp 的 URL，並記下回應帶的 fingerprint", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ metrics: { rateLimitPercent: 10 }, fingerprint: REAL_FP })
    );
    const apply = vi.fn();

    const next = await pollStatusOnce("", fetchFn as unknown as typeof fetch, apply);

    expect(fetchFn).toHaveBeenCalledWith("/api/status");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(next).toBe(REAL_FP);
  });

  it("第二輪把上一輪的 fingerprint 帶回去", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ unchanged: true, fingerprint: REAL_FP }));
    const apply = vi.fn();

    await pollStatusOnce(REAL_FP, fetchFn as unknown as typeof fetch, apply);

    expect(fetchFn).toHaveBeenCalledWith("/api/status?fp=" + encodeURIComponent(REAL_FP));
  });

  it("unchanged: true → 不呼叫 applyData（不得用空資料覆蓋畫面）", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ unchanged: true, fingerprint: REAL_FP }));
    const apply = vi.fn();

    const next = await pollStatusOnce(REAL_FP, fetchFn as unknown as typeof fetch, apply);

    expect(apply).not.toHaveBeenCalled();
    expect(next).toBe(REAL_FP);
  });

  it("有資料的回應 → 呼叫 applyData 並推進 fingerprint", async () => {
    const body = { metrics: { rateLimitPercent: 42 }, fingerprint: "fpNEW" };
    const fetchFn = vi.fn(async () => jsonResponse(body));
    const apply = vi.fn();

    const next = await pollStatusOnce("fpOLD", fetchFn as unknown as typeof fetch, apply);

    expect(apply).toHaveBeenCalledWith(body);
    expect(next).toBe("fpNEW");
  });

  it("res.ok = false → 不 apply、不推進 fingerprint（下一輪仍帶舊 fp）", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ oops: true }, false));
    const apply = vi.fn();

    const next = await pollStatusOnce("fpOLD", fetchFn as unknown as typeof fetch, apply);

    expect(apply).not.toHaveBeenCalled();
    expect(next).toBe("fpOLD");
  });

  it("回應沒帶 fingerprint（舊版 server）→ 保留舊 fp，仍照常 apply", async () => {
    // 向後相容：server 若還沒部署閘門版，client 不能因此卡住或誤判成已同步
    const fetchFn = vi.fn(async () => jsonResponse({ metrics: { rateLimitPercent: 1 } }));
    const apply = vi.fn();

    const next = await pollStatusOnce("fpOLD", fetchFn as unknown as typeof fetch, apply);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(next).toBe("fpOLD");
  });

  it("fetch 例外 → 往上拋，由 hook 的 catch 保住舊 fingerprint", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    });
    const apply = vi.fn();

    await expect(
      pollStatusOnce("fpOLD", fetchFn as unknown as typeof fetch, apply)
    ).rejects.toThrow("network down");
    expect(apply).not.toHaveBeenCalled();
  });

  it("連續 20 輪 unchanged → applyData 一次都沒被呼叫，每輪都帶著 fp", async () => {
    const fetchFn = vi.fn(async (_url: string) =>
      jsonResponse({ unchanged: true, fingerprint: REAL_FP })
    );
    const apply = vi.fn();

    let fp = REAL_FP;
    for (let n = 0; n < 20; n++) {
      fp = await pollStatusOnce(fp, fetchFn as unknown as typeof fetch, apply);
    }

    expect(fetchFn).toHaveBeenCalledTimes(20);
    expect(apply).not.toHaveBeenCalled();
    for (const call of fetchFn.mock.calls) {
      expect(call[0]).toBe("/api/status?fp=" + encodeURIComponent(REAL_FP));
    }
  });
});
