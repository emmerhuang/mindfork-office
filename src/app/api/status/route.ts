import { NextRequest, NextResponse } from "next/server";
import { MemberStatus } from "@/types";
import { fetchStatusGated, statusKeyList, tursoDetect } from "./stream/detect";

const TURSO_URL = process.env.TURSO_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

/**
 * 合法 memberId 白名單（task #301 P2 防禦）
 *
 * 歷史上某段 code 把字串型 memberId 當 spread 寫進 members dict，
 * 導致線上 43 個 key 中 32 個是中英文單字元亂碼（'。','W','i','k'...）。
 * GET 端跳過不在白名單內的 key + console.warn；POST 端拒收非白名單 memberId。
 */
const VALID_MEMBER_IDS = new Set([
  "boss",
  "secretary",
  "sherlock",
  "lego",
  "vault",
  "lens",
  "forge",
  "grant",
  "mika",
  "yuki",
  "waffles",
]);

function isValidMemberId(id: unknown): id is string {
  return typeof id === "string" && VALID_MEMBER_IDS.has(id);
}

/**
 * 從 raw members JSON 過濾掉不在白名單的 key（含 spread string 留下的單字元亂碼）。
 * 跑過時若偵測到髒資料，console.warn 一次提醒，方便日後抓到再次寫入的兇手。
 */
function sanitizeMembers(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, unknown> = {};
  const dirtyKeys: string[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidMemberId(k)) {
      clean[k] = v;
    } else {
      dirtyKeys.push(k);
    }
  }
  if (dirtyKeys.length > 0) {
    // 不洩 key 內容（避免 log injection），只記數量
    console.warn(
      `[api/status] members has ${dirtyKeys.length} invalid keys (skipped). ` +
      `valid count=${Object.keys(clean).length}`
    );
  }
  return clean;
}

interface TursoResponse {
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

interface TursoStmtArg { type: string; value: string }
interface TursoStmt { sql: string; args?: TursoStmtArg[] }

async function tursoExecute(statements: TursoStmt[]): Promise<TursoResponse> {
  const requests = statements.map((stmt) => ({
    type: "execute" as const,
    stmt,
  }));

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
    throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

function rowsToMap(result: TursoResponse, idx: number = 0): Record<string, string> {
  const map: Record<string, string> = {};
  const r = result.results[idx];
  if (r?.type === "ok" && r.response?.result?.rows) {
    for (const row of r.response.result.rows) {
      const key = row[0]?.value;
      const value = row[1]?.value;
      if (key) map[key] = value;
    }
  }
  return map;
}

const FALLBACK_METRICS = {
  rateLimitPercent: -1,
  pendingTasks: -1,
  totalCostUsd: -1,
  modelId: "",
  modelName: "",
  contextUsedPercent: -1,
  updatedAt: new Date().toISOString(),
};

/**
 * 完整 batch（一段查詢）。
 *
 * ⚠ 2026-07-29 起只剩 mindfork_status 一條。原本還有 chat_channels（active private）與
 *   chat_messages preload 兩條，隨私聊整條拆除一併移除（老大 #13857-13859），
 *   同時也是「drop Turso chat_messages」的前提。
 *   本專案原本只查 `channel_type='private'`，所以拆私聊等於拆掉本專案全部的 chat 讀取；
 *   會議訊息（channel_type='meeting'）從來不在這裡讀。
 */
function fetchStatusFull(): Promise<TursoResponse> {
  return tursoExecute([
    { sql: `SELECT key, value FROM mindfork_status WHERE key IN (${statusKeyList()})` },
  ]);
}

/**
 * GET /api/status — 兩段式（2026-07-28 Forge）
 *
 * 這條路徑是 useStatusStream 的 fallback：SSE 連 5 次失敗後每 15 秒打一次。
 * 原本每輪都跑上面的完整 batch，一輪 679 列、一個卡住的分頁一天 391 萬列。
 *
 * 現在先跑 cheap detect（45 列）；client 用 ?fp= 帶回上一輪的 fingerprint，
 * 沒變就直接回 { unchanged: true } 而不碰完整 batch。
 *
 * 閘門為什麼在這裡而不是在 hook：這個 handler 一被呼叫，679 列就已經在 Turso
 * 讀掉了。client 端比對是「付完錢才決定不買」，省不到任何東西。
 *
 * 相容性：沒帶 fp（首載、或舊版 client）時 fingerprint 必然與空字串不同，
 * 一定走完整 batch，行為與加閘門前相同。
 */
export async function GET(request: NextRequest) {
  try {
    const clientFingerprint = request.nextUrl.searchParams.get("fp") ?? "";

    const gated = await fetchStatusGated(clientFingerprint, {
      detect: tursoDetect,
      full: fetchStatusFull,
    });

    if (gated.unchanged) {
      return NextResponse.json({
        unchanged: true,
        fingerprint: gated.fingerprint,
      });
    }

    const result = gated.data;
    const map = rowsToMap(result, 0);

    const metrics = map.metrics
      ? JSON.parse(map.metrics)
      : { ...FALLBACK_METRICS };
    const rawMembers = map.members ? JSON.parse(map.members) : {};
    const members = sanitizeMembers(rawMembers);
    const rawOs = map.member_os ? JSON.parse(map.member_os) : {};
    const taskQueue = map.task_queue ? JSON.parse(map.task_queue) : [];
    const meeting = map.meeting ? JSON.parse(map.meeting) : { active: false };

    const memberOs: Record<string, Array<{ text: string; task?: string; at?: string }>> = {};
    for (const [k, v] of Object.entries(rawOs)) {
      if (!Array.isArray(v)) {
        memberOs[k] = [{ text: String(v), task: "", at: "" }];
      } else {
        memberOs[k] = (v as unknown[]).map((item) => {
          if (typeof item === "string") return { text: item, task: "", at: "" };
          if (typeof item === "object" && item !== null && "text" in item)
            return item as { text: string; task?: string; at?: string };
          return { text: String(item), task: "", at: "" };
        });
      }
    }

    const memberProfiles = map.member_profiles ? JSON.parse(map.member_profiles) : [];

    return NextResponse.json({
      members,
      metrics,
      memberOs,
      taskQueue,
      meeting,
      memberProfiles,
      fingerprint: gated.fingerprint,
    });
  } catch (err) {
    console.error("GET /api/status error:", err);
    // 錯誤回應刻意不帶 fingerprint：client 會保留舊值，下一輪重試而不是誤判成已同步。
    return NextResponse.json({
      members: {},
      metrics: { ...FALLBACK_METRICS },
    });
  }
}

// POST /api/status - upsert metrics/members into Turso (unchanged)
// Requires Authorization: Bearer <MINDFORK_API_KEY>
export async function POST(request: NextRequest) {
  const apiKey = process.env.MINDFORK_API_KEY;
  const authHeader = request.headers.get("authorization");
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();

    const current = await tursoExecute([
      { sql: "SELECT key, value FROM mindfork_status WHERE key IN ('metrics', 'members', 'member_os')" },
    ]);
    const map = rowsToMap(current, 0);

    let metrics = map.metrics
      ? JSON.parse(map.metrics)
      : { ...FALLBACK_METRICS };
    // 讀取既有 members 時順手清掉髒 key（task #301）—
    // 這樣每次 POST 都會把線上殘留的單字元亂碼 key 自動修掉，
    // 不需要另寫一次性清理腳本。
    let members = sanitizeMembers(
      map.members ? JSON.parse(map.members) : {}
    ) as Record<string, { status: MemberStatus; task: string; updatedAt?: string }>;

    if (
      body.rateLimitPercent !== undefined ||
      body.pendingTasks !== undefined ||
      body.totalCostUsd !== undefined ||
      body.modelId !== undefined ||
      body.contextUsedPercent !== undefined
    ) {
      if (body.rateLimitPercent !== undefined) {
        metrics.rateLimitPercent = body.rateLimitPercent;
      }
      if (body.pendingTasks !== undefined) {
        metrics.pendingTasks = Math.max(0, body.pendingTasks);
      }
      if (body.totalCostUsd !== undefined) {
        metrics.totalCostUsd = body.totalCostUsd;
      }
      if (body.modelId !== undefined) {
        metrics.modelId = body.modelId;
        metrics.modelName = body.modelName ?? body.modelId;
      }
      if (body.contextUsedPercent !== undefined) {
        metrics.contextUsedPercent = body.contextUsedPercent;
      }
      metrics.updatedAt = new Date().toISOString();
    }

    if (body.memberId !== undefined) {
      const { memberId, status, task } = body;

      // task #301：memberId 必須是合法白名單成員（防 spread string 等畸形寫入）
      if (!isValidMemberId(memberId)) {
        return NextResponse.json(
          { error: `Invalid memberId. Must be one of: ${[...VALID_MEMBER_IDS].join(", ")}` },
          { status: 400 }
        );
      }

      if (!status) {
        return NextResponse.json(
          { error: "status is required when memberId is provided" },
          { status: 400 }
        );
      }

      const validStatuses: MemberStatus[] = [
        "idle", "working", "meeting", "sleeping", "celebrating",
      ];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }

      members[memberId] = {
        status,
        task: typeof task === "string" ? task : "",
        updatedAt: new Date().toISOString(),
      };
    }

    let meetingPayload: { active: boolean; topic?: string; startedAt?: string } | undefined;
    if (body.meeting !== undefined) {
      if (body.meeting === true || body.meeting === "start") {
        meetingPayload = { active: true, topic: body.meetingTopic || "", startedAt: new Date().toISOString() };
      } else if (body.meeting === false || body.meeting === "end") {
        meetingPayload = { active: false };
      }
    }

    const now = new Date().toISOString();
    const upserts: TursoStmt[] = [
      {
        sql: "INSERT INTO mindfork_status (key, value, updated_at) VALUES ('metrics', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        args: [
          { type: "text", value: JSON.stringify(metrics) },
          { type: "text", value: now },
        ],
      },
      {
        sql: "INSERT INTO mindfork_status (key, value, updated_at) VALUES ('members', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        args: [
          { type: "text", value: JSON.stringify(members) },
          { type: "text", value: now },
        ],
      },
    ];

    if (meetingPayload) {
      upserts.push({
        sql: "INSERT INTO mindfork_status (key, value, updated_at) VALUES ('meeting', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        args: [
          { type: "text", value: JSON.stringify(meetingPayload) },
          { type: "text", value: now },
        ],
      });
    }

    await tursoExecute(upserts);

    return NextResponse.json({ ok: true, members, metrics, ...(meetingPayload ? { meeting: meetingPayload } : {}) });
  } catch (err) {
    console.error("POST /api/status error:", err);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
