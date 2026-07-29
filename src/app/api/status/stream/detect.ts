/**
 * 兩段式輪詢的查詢層 + 純函式（2026-07-02 Forge，修 Turso 讀爆 292M/天）
 *
 * 背景：原本每 5 秒每連線跑一次含 `chat_messages ... LIMIT 1500` 的完整 batch，
 * 就算畫面沒變也照撈 1500 列（__fingerprint 只擋「推播」不擋「讀 DB」）。
 *
 * 拆兩層：
 *  1) tursoDetect() — 只讀 1 個純量（mindfork_status 的 MAX(updated_at)）算 cheap
 *     fingerprint。
 *  2) tursoFetchFull() — 有變才跑的完整 batch，供 buildPayload 推播。
 *
 * 行為等價保證：cheap fingerprint 涵蓋 mindfork_status（用 MAX(updated_at)），
 * 任何成員狀態變動都會使 fingerprint 改變，對應「有資料變才需推播」；沒變則只送 heartbeat。
 *
 * ── 2026-07-29 Forge：chat 訊號整批移除（老大 #13857-13859 拆私聊） ──────────
 * 原本 fingerprint 還含 `chat_channels.MAX(updated_at)` 與 `chat_messages.MAX(id)`，
 * 完整 batch 還撈 1500 列 chat_messages 當 preload。私聊功能已整條拆除
 * （老大 #13859「留下 review 會議的部分就好了」），所以：
 *   ‧ 那兩個訊號**不會再變動** ⟹ 留著只是每輪多讀兩個純量、對偵測零貢獻
 *   ‧ 本檔對 chat 表的依賴是「drop Turso chat_messages」的阻擋項之一
 * ⚠ 本模組的職責一直是「偵測成員狀態變化」，chat 訊號是後來搭上來的；移除它不縮小職責。
 * ⚠ 會議訊息（`channel_type='meeting'`）**不在本專案的讀取範圍內** —— 本專案原本只查
 *   `channel_type='private'`（見移除前的 chat_channels 查詢），所以拆私聊等於拆掉全部。
 *   本檔提到的 `meeting` 是 `mindfork_status` 的一個 key（會議進行中旗標），與 chat 表無關。
 *
 * 註：純函式與查詢層抽到本模組（非 route.ts）——Next.js App Router route handler 檔
 * 只允許 export HTTP method handler + 特定 config，不能 export 任意具名函式，
 * 否則觸發 .next/types route 型別檢查失敗。抽到相鄰模組同時讓純函式可單元測試。
 *
 * ── 2026-07-28 Forge 第二輪 ──────────────────────────────────────────────
 * (a) fetchStatusGated()：把「先偵測、沒變就不撈」抽成 server 端可共用的閘門，
 *     供 /api/status 的 fallback 路徑使用（見該檔 GET）。
 *     閘門必須在 server：/api/status 一被打，完整 batch 就已經在 Turso 讀掉了，
 *     client 拿到 JSON 再比對是「付完錢才決定不買」。
 * (b) detect 的 mindfork_status 範圍限縮到 DETECT_STATUS_KEYS。
 */

const TURSO_URL = process.env.TURSO_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

/**
 * 畫面真的會用到的 mindfork_status key（唯一定義處）。
 *
 * `mindfork_status` 是共用 KV 表，正式庫實查（2026-07-28）12 個 key 裡有 6 個
 * 與辦公室畫面無關：chat_summaries / conv_bar_settings / layout /
 * rate_limit:dialogue:<IP> ×3。原本 detect 用 `MAX(updated_at) FROM mindfork_status`
 * 全表取值，那 6 個 key 任何一次寫入都會讓 fingerprint 改變、偽造出「有變」，
 * 逼出一次完整 batch。
 *
 * ⚠️ 這個污染在限縮之前「剛好沒爆」，靠的是一個沒人設計過的巧合：
 * updated_at 是 TEXT、MAX() 走字典序；展示 key 由 Python sync 寫成 `+08:00`，
 * 而 rate_limit:* / layout / conv_bar_settings 由 Next route 的 toISOString()
 * 寫成 `Z`（UTC）。同一時刻的 `Z` 字串因此排在 `+08:00` 字串後方 8 小時的位置、
 * 亦即偏低，追不上每 10 分鐘就被 sync 更新一次的展示 key。
 * 例外是 chat_summaries——它是 `+08:00` 格式，寫它會真的偽造出「有變」。
 * 不能倚賴這種巧合，所以改成明列 key。
 *
 * 註：限縮 key 不會減少 rows_read（實測 45 對 45），這是正確性修正、不是成本修正。
 *
 * 三處 SQL（detect / tursoFetchFull / /api/status 的 GET batch）共用這份定義，
 * 避免偵測範圍與實際讀取範圍各自漂移。
 */
export const DETECT_STATUS_KEYS = [
  "metrics",
  "members",
  "member_os",
  "task_queue",
  "meeting",
  "member_profiles",
] as const;

/** 產出可直接嵌入 SQL 的 key 字面清單。內容為編譯期常數，無注入面。 */
export function statusKeyList(): string {
  return DETECT_STATUS_KEYS.map((k) => `'${k}'`).join(", ");
}

/** cheap 偵測 SQL（1 個純量）。mindfork_status 只看 DETECT_STATUS_KEYS。 */
export function detectSql(): string {
  return (
    `SELECT (SELECT MAX(updated_at) FROM mindfork_status WHERE key IN (${statusKeyList()})) AS status_max`
  );
}

export interface TursoResponse {
  results: Array<{
    type: string;
    response: {
      type: string;
      result: {
        cols: Array<{ name: string }>;
        rows: Array<Array<{ type: string; value: string }>>;
      };
    };
  }>;
}

export interface TursoQueryResult {
  map: Record<string, string>;
  rawData: TursoResponse;
}

/** cheap 偵測查詢的原始結果（1 個純量） */
export interface DetectRaw {
  statusMax: string;
}

/**
 * 純函式：由偵測原始純量組出 cheap fingerprint。
 * 抽出以便單元測試「fingerprint 隨任一訊號變動而變、否則不變」。
 */
export function computeCheapFingerprint(d: DetectRaw): string {
  return `status:${d.statusMax}`;
}

/**
 * 純函式：輪詢一輪是否需要跑完整 fetch（撈 1500 列）。
 * 只有 cheap fingerprint 與上次不同才需要——這是「有變才撈重查詢」的決策核心。
 */
export function shouldFetchFull(cheapFingerprint: string, lastFingerprint: string): boolean {
  return cheapFingerprint !== lastFingerprint;
}

/** 從 Turso pipeline response 的單一 result 取第一列指定 col 的 value（找不到回 fallback） */
function scalarFromResult(
  result: TursoResponse["results"][number] | undefined,
  colIndex: number,
  fallback = "0"
): string {
  if (result?.type !== "ok") return fallback;
  const v = result.response?.result?.rows?.[0]?.[colIndex]?.value;
  return v ?? fallback;
}

/**
 * 純函式：把偵測 batch 的 TursoResponse 解成 DetectRaw。
 * 偵測 batch 只有一條 SQL（見 tursoDetect），三個純量都在 results[0] 的同一列。
 */
export function parseDetectResponse(data: TursoResponse): DetectRaw {
  return { statusMax: scalarFromResult(data.results[0], 0) };
}

async function tursoPipeline(
  requests: Array<{ type: string; stmt: { sql: string } }>
): Promise<TursoResponse> {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TURSO_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Turso HTTP ${res.status}`);
  }

  return (await res.json()) as TursoResponse;
}

/**
 * 輕量偵測：只讀 1 個純量、算 cheap fingerprint。
 */
export async function tursoDetect(): Promise<string> {
  const data = await tursoPipeline([
    { type: "execute", stmt: { sql: detectSql() } },
  ]);
  return computeCheapFingerprint(parseDetectResponse(data));
}

/** 兩段式閘門的結果：沒變只帶 fingerprint，有變才帶 full fetch 的產物。 */
export type GatedResult<T> =
  | { unchanged: true; fingerprint: string }
  | { unchanged: false; fingerprint: string; data: T };

export interface StatusGateDeps<T> {
  /** cheap 偵測：只讀 1 個純量 */
  detect: () => Promise<string>;
  /** 重查詢：呼叫端自己的完整 batch */
  full: () => Promise<T>;
}

/**
 * 兩段式閘門：先跑 cheap detect，fingerprint 與呼叫端上次拿到的相同就直接回
 * unchanged，完全不碰重查詢。
 *
 * full 由呼叫端注入，因為 SSE 與 /api/status 的完整 batch 內容不同
 * （前者 4 條含 fingerprint stmt、後者 3 條）。本輪不合併那兩份 SQL。
 *
 * detect 失敗時例外往上拋，不吞成 unchanged——吞掉會讓畫面永遠停在舊資料。
 */
export async function fetchStatusGated<T>(
  lastFingerprint: string,
  deps: StatusGateDeps<T>
): Promise<GatedResult<T>> {
  const fingerprint = await deps.detect();

  if (!shouldFetchFull(fingerprint, lastFingerprint)) {
    return { unchanged: true, fingerprint };
  }

  const data = await deps.full();
  return { unchanged: false, fingerprint, data };
}

/**
 * 完整抓取：mindfork_status 一條 batch（chat 相關的 3 條已隨私聊拆除移除）。
 * 只有 cheap fingerprint 變動 / 首次連線才呼叫。
 */
export async function tursoFetchFull(): Promise<TursoQueryResult> {
  const data = await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `SELECT key, value, updated_at FROM mindfork_status WHERE key IN (${statusKeyList()})`,
      },
    },
  ]);

  const map: Record<string, string> = {};
  const updatedAtMap: Record<string, string> = {};

  // Only result[0] is the mindfork_status key/value/updated_at table
  const statusResult = data.results[0];
  if (statusResult?.type === "ok" && statusResult.response?.result?.rows) {
    for (const row of statusResult.response.result.rows) {
      const key = row[0]?.value;
      const value = row[1]?.value;
      const updatedAt = row[2]?.value;
      if (key) {
        map[key] = value;
        updatedAtMap[key] = updatedAt;
      }
    }
  }

  // fingerprint = 只看 mindfork_status 的 updated_at（chat 訊號已隨私聊拆除一併移除）
  const fingerprint = Object.keys(updatedAtMap)
    .sort()
    .map((k) => `${k}:${updatedAtMap[k]}`)
    .join("|");
  map.__fingerprint = fingerprint;

  return { map, rawData: data };
}
