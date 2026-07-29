import { describe, it, expect } from "vitest";
import { shouldFetchFull } from "./detect";

/**
 * 兩段式輪詢的「決策」核心：這一輪要不要跑完整 fetch（撈 1500 列）。
 *
 * 契約（對應 route.ts 兩段式輪詢 spec）：
 *   只有 cheap fingerprint 與上次不同才需要跑 full fetch。
 *   - 沒變 → false（只送 heartbeat，不碰重查詢）
 *   - 有變 → true（撈完整 batch + 推播）
 *   - 首次連線（上次為空字串）→ true（一定要撈一次當基準）
 */

describe("shouldFetchFull", () => {
  it("fingerprint 沒變 → 不 fetch full", () => {
    expect(shouldFetchFull("fpA", "fpA")).toBe(false);
  });

  it("fingerprint 有變 → 要 fetch full", () => {
    expect(shouldFetchFull("fpB", "fpA")).toBe(true);
  });

  it("首次連線（上次為空字串）→ 要 fetch full", () => {
    expect(shouldFetchFull("fpA", "")).toBe(true);
  });

  it("連續兩輪同 fp → 第二輪不再 fetch（模擬 poll 迴圈）", () => {
    let last = "";
    const round1 = shouldFetchFull("fpA", last);
    expect(round1).toBe(true); // 首輪有變（空 → fpA），要撈
    if (round1) last = "fpA"; // 更新 lastFingerprint（模擬迴圈行為）

    const round2 = shouldFetchFull("fpA", last);
    expect(round2).toBe(false); // 第二輪同值，不再撈
  });
});
