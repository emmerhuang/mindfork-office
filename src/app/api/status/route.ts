import { NextRequest, NextResponse } from "next/server";
import { MemberStatus } from "@/types";

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

interface ChatRow {
  id: number;
  channel_id: string;
  sender: string;
  recipient: string;
  content: string;
  created_at: string;
}

interface ChannelSummary {
  channel_id: string;
  participant_a: string;
  participant_b: string;
  last_at: string;
  last_message?: string;
  last_sender?: string;
  message_count?: number;
  messages: Array<{ id?: number; sender: string; content: string; created_at: string }>;
}

/**
 * Phase 2 chat summary builder（Sherlock 設計稿 §5）
 *
 * 主路徑：吃 chat_channels（last_*, message_count），快、不掃 messages 表
 * Fallback：chat_channels 是空表（cleanup 還沒跑過）→ 從 chat_messages 即時聚合
 *
 * messages 預載：每頻道帶最新 50 筆 ASC（給 ChatRoom 開門即看到內容，
 *   想看更舊上拉觸發 /api/chat/messages?before_id=）
 */
function buildChatSummaries(
  channelsResult: TursoResponse["results"][number] | undefined,
  messagesResult: TursoResponse["results"][number] | undefined,
): ChannelSummary[] {
  // 解析 messages（永遠跑：preload 用）
  const msgRows: ChatRow[] =
    messagesResult?.type === "ok" && messagesResult.response?.result?.rows
      ? messagesResult.response.result.rows.map((row) => ({
          id: parseInt(row[0]?.value || "0", 10),
          channel_id: row[1]?.value || "",
          sender: row[2]?.value || "",
          recipient: row[3]?.value || "",
          content: row[4]?.value || "",
          created_at: row[5]?.value || "",
        }))
      : [];

  const messagesByChannel = new Map<string, ChatRow[]>();
  for (const m of msgRows) {
    if (!messagesByChannel.has(m.channel_id)) messagesByChannel.set(m.channel_id, []);
    messagesByChannel.get(m.channel_id)!.push(m);
  }

  // 解析 chat_channels rows（主路徑）
  const channelRows =
    channelsResult?.type === "ok" && channelsResult.response?.result?.rows
      ? channelsResult.response.result.rows
      : [];

  // 路徑 A：chat_channels 有資料 → 用它組
  if (channelRows.length > 0) {
    const summaries: ChannelSummary[] = [];
    for (const row of channelRows) {
      const channelId = row[0]?.value || "";
      const lastMessage = row[1]?.value || "";
      const lastSender = row[2]?.value || "";
      const lastAt = row[3]?.value || "";
      const messageCount = parseInt(row[4]?.value || "0", 10);

      // participant 從 channel_id 拆（同既有規則：pipe 優先，dash 後備）
      let parts = channelId.split("|");
      if (parts.length < 2) parts = channelId.split("-");
      const participantA = (parts[0] || "").toLowerCase();
      const participantB = (parts[1] || "").toLowerCase();

      // 取該 channel 的 preload messages（已從 chat_messages 撈了，作 ASC sort）
      const preload = messagesByChannel.get(channelId) || [];
      preload.sort((a, b) => a.id - b.id);

      summaries.push({
        channel_id: channelId,
        participant_a: participantA,
        participant_b: participantB,
        last_at: lastAt,
        last_message: lastMessage,
        last_sender: lastSender,
        message_count: messageCount,
        messages: preload.map((r) => ({
          id: r.id,
          sender: r.sender,
          content: r.content,
          created_at: r.created_at,
        })),
      });
    }
    summaries.sort((a, b) => (b.last_at || "").localeCompare(a.last_at || ""));
    return summaries;
  }

  // 路徑 B（fallback）：chat_channels 空 → 從 messages 聚合（舊 GET 行為）
  const channelMap = new Map<string, ChatRow[]>();
  for (const row of msgRows) {
    if (!channelMap.has(row.channel_id)) channelMap.set(row.channel_id, []);
    channelMap.get(row.channel_id)!.push(row);
  }
  const summaries: ChannelSummary[] = [];
  for (const [channelId, rows] of channelMap) {
    rows.sort((a, b) => a.id - b.id);
    let parts = channelId.split("|");
    if (parts.length < 2) parts = channelId.split("-");
    const participantA = (parts[0] || "").toLowerCase();
    const participantB = (parts[1] || "").toLowerCase();
    const lastRow = rows[rows.length - 1];
    summaries.push({
      channel_id: channelId,
      participant_a: participantA,
      participant_b: participantB,
      last_at: lastRow.created_at,
      last_message: (lastRow.content || "").slice(0, 100),
      last_sender: lastRow.sender,
      message_count: rows.length,
      messages: rows.map((r) => ({
        id: r.id,
        sender: r.sender,
        content: r.content,
        created_at: r.created_at,
      })),
    });
  }
  summaries.sort((a, b) => b.last_at.localeCompare(a.last_at));
  return summaries;
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

// GET /api/status - read metrics, members, chat summaries from Turso
export async function GET() {
  try {
    // 三段查詢（簡化版，2026-04-30 老大 5635：30 天 DELETE 不留歷史）：
    //   [0] mindfork_status keys
    //   [1] chat_channels（active private + 有訊息的 deleted 也帶上）
    //   [2] chat_messages preload（每頻道最新 N 筆 — 用 ROW_NUMBER 切窗）
    //
    // preload 策略：先撈最近 1500 筆 messages（30 天內全部都是熱資料），
    // 在 server 端按 channel 分桶並截每桶 50 筆。
    // 為什麼不在 SQL 裡用 window function：libSQL 支援但複雜；1500 筆排序 cheap。
    const result = await tursoExecute([
      { sql: "SELECT key, value FROM mindfork_status WHERE key IN ('metrics', 'members', 'member_os', 'task_queue', 'meeting', 'member_profiles')" },
      {
        sql:
          "SELECT channel_id, last_message, last_sender, last_at, message_count, status " +
          "FROM chat_channels " +
          "WHERE channel_type='private' AND status='active' " +
          "ORDER BY last_at DESC",
      },
      {
        sql:
          "SELECT id, channel_id, sender, recipient, content, created_at " +
          "FROM chat_messages " +
          "ORDER BY id DESC LIMIT 1500",
      },
    ]);

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

    // 把每頻道 preload 截成最多 50 筆（預設 LIMIT，之後上拉再撈舊）
    const PRELOAD_PER_CHANNEL = 50;
    const allSummaries = buildChatSummaries(result.results[1], result.results[2]);
    const chatSummaries = allSummaries.map((s) => ({
      ...s,
      messages: s.messages.slice(-PRELOAD_PER_CHANNEL), // ASC 排序，留最新 N 筆
    }));

    return NextResponse.json({ members, metrics, memberOs, taskQueue, meeting, memberProfiles, chatSummaries });
  } catch (err) {
    console.error("GET /api/status error:", err);
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
