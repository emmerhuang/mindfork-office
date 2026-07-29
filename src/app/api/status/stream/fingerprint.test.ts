import { describe, it, expect } from "vitest";
import { computeCheapFingerprint, parseDetectResponse, detectSql } from "./detect";

/**
 * cheap fingerprint 正確性（兩段式輪詢的「偵測」核心）。
 *
 * 契約（2026-07-29 起）：fingerprint 只涵蓋 `mindfork_status.MAX(updated_at)`。
 * 成員狀態變 → fingerprint 變（觸發 full fetch + 推播）；不變 → fingerprint 不變（只送 heartbeat）。
 *
 * 🔴 原本還含 chat_channels.MAX(updated_at) 與 chat_messages.MAX(id)。私聊已整條拆除
 *   （老大 #13857-13859），那兩個訊號不會再變動 ⟹ 對偵測零貢獻，且是 drop chat_messages
 *   的阻擋項。移除它們**不縮小本模組的職責**：它的職責一直是偵測成員狀態變化。
 *
 * 🔴 兩個方向都鎖：
 *   ① 狀態變 → fingerprint 必須變（否則畫面永遠停在舊資料）
 *   ② 狀態沒變 → fingerprint 必須不變（否則每輪都撈重查詢，等於這層閘白做）
 */

function detectResponse(statusMax: string) {
  return {
    results: [
      {
        type: "ok",
        response: {
          type: "ok",
          result: {
            cols: [{ name: "status_max" }],
            rows: [[{ type: "text", value: statusMax }]],
          },
        },
      },
    ],
  };
}

describe("computeCheapFingerprint", () => {
  it("方向②：相同輸入 → 相同 fingerprint（沒變就不該撈重查詢）", () => {
    expect(computeCheapFingerprint({ statusMax: "T1" })).toBe(
      computeCheapFingerprint({ statusMax: "T1" })
    );
  });

  it("方向①：mindfork_status 變 → fingerprint 變", () => {
    expect(computeCheapFingerprint({ statusMax: "T2" })).not.toBe(
      computeCheapFingerprint({ statusMax: "T1" })
    );
  });
});

describe("detectSql", () => {
  it("🔴 偵測 SQL 完全不碰 chat 表（drop chat_messages 的前提）", () => {
    const sql = detectSql();
    expect(sql).not.toContain("chat_messages");
    expect(sql).not.toContain("chat_channels");
  });

  it("仍然讀 mindfork_status（成員狀態訊號不可一起弄丟）", () => {
    expect(detectSql()).toContain("FROM mindfork_status");
  });
});

describe("parseDetectResponse", () => {
  it("從 detect batch response 萃出那一個純量", () => {
    expect(parseDetectResponse(detectResponse("2026-07-29T10:00:00"))).toEqual({
      statusMax: "2026-07-29T10:00:00",
    });
  });

  it("結果缺失時退回 fallback '0'（不 crash）", () => {
    expect(parseDetectResponse({ results: [] })).toEqual({ statusMax: "0" });
  });

  it("result type 非 ok 時退回 fallback（error result 不誤判為有變）", () => {
    expect(
      parseDetectResponse({
        results: [{ type: "error", response: { type: "error", result: { cols: [], rows: [] } } }],
      })
    ).toEqual({ statusMax: "0" });
  });

  it("端到端：detect response → fingerprint 隨 statusMax 改變", () => {
    expect(computeCheapFingerprint(parseDetectResponse(detectResponse("T2")))).not.toBe(
      computeCheapFingerprint(parseDetectResponse(detectResponse("T1")))
    );
  });
});
