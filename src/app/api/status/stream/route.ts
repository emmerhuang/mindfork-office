import { NextRequest } from "next/server";

const TURSO_URL = process.env.TURSO_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

/** 合法 memberId 白名單（task #301，與 /api/status route.ts 同步維護）*/
const VALID_MEMBER_IDS = new Set([
  "boss", "secretary", "sherlock", "lego", "vault", "lens",
  "forge", "grant", "mika", "yuki", "waffles",
]);

/** 過濾掉不在白名單的 member key（單字元亂碼等）*/
function sanitizeMembers(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, unknown> = {};
  let dirty = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === "string" && VALID_MEMBER_IDS.has(k)) clean[k] = v;
    else dirty++;
  }
  if (dirty > 0) {
    console.warn(
      `[api/status/stream] members has ${dirty} invalid keys (skipped). ` +
      `valid count=${Object.keys(clean).length}`
    );
  }
  return clean;
}

/** Poll interval for checking Turso changes (ms) */
const POLL_INTERVAL = 5_000;

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

interface TursoQueryResult {
  map: Record<string, string>;
  rawData: TursoResponse;
}

async function tursoQuery(): Promise<TursoQueryResult> {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TURSO_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: {
            sql: "SELECT key, value, updated_at FROM mindfork_status WHERE key IN ('metrics', 'members', 'member_os', 'task_queue', 'meeting', 'member_profiles')",
          },
        },
        {
          // Phase 2: 改吃 chat_channels summary
          type: "execute",
          stmt: {
            sql:
              "SELECT channel_id, last_message, last_sender, last_at, message_count, status, updated_at " +
              "FROM chat_channels " +
              "WHERE channel_type='private' AND status='active' " +
              "ORDER BY last_at DESC",
          },
        },
        {
          // messages preload — 為每頻道帶最新 N 筆 ASC 給 ChatRoom
          // 簡化版（2026-04-30 老大 5635）：30 天物理刪除，不再用 archived_at 過濾
          type: "execute",
          stmt: {
            sql:
              "SELECT id, channel_id, sender, recipient, content, created_at " +
              "FROM chat_messages " +
              "ORDER BY id DESC LIMIT 1500",
          },
        },
        {
          // 用 max(updated_at) of chat_channels + max(id) of chat_messages 當 fingerprint
          type: "execute",
          stmt: {
            sql:
              "SELECT (SELECT MAX(updated_at) FROM chat_channels) AS chat_ch_ts, " +
              "(SELECT MAX(id) FROM chat_messages) AS msg_max",
          },
        },
      ],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Turso HTTP ${res.status}`);
  }

  const data: TursoResponse = await res.json();
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

  // fingerprint = mindfork_status updated_at + chat_channels max updated_at + chat_messages max id
  const fpRow = data.results[3]?.response?.result?.rows?.[0];
  const chatChTs = fpRow?.[0]?.value || "0";
  const msgMax = fpRow?.[1]?.value || "0";

  const fingerprint =
    Object.keys(updatedAtMap)
      .sort()
      .map((k) => `${k}:${updatedAtMap[k]}`)
      .join("|") + `|chat_ch:${chatChTs}|msg_max:${msgMax}`;
  map.__fingerprint = fingerprint;

  return { map, rawData: data };
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

const PRELOAD_PER_CHANNEL = 50;

function buildChatSummaries(data: TursoResponse): ChannelSummary[] {
  const channelsResult = data.results[1];
  const messagesResult = data.results[2];

  // 解 messages（preload 用）
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

  const channelRows =
    channelsResult?.type === "ok" && channelsResult.response?.result?.rows
      ? channelsResult.response.result.rows
      : [];

  // 主路徑：chat_channels 有資料
  if (channelRows.length > 0) {
    const summaries: ChannelSummary[] = [];
    for (const row of channelRows) {
      const channelId = row[0]?.value || "";
      const lastMessage = row[1]?.value || "";
      const lastSender = row[2]?.value || "";
      const lastAt = row[3]?.value || "";
      const messageCount = parseInt(row[4]?.value || "0", 10);

      let parts = channelId.split("|");
      if (parts.length < 2) parts = channelId.split("-");
      const participantA = (parts[0] || "").toLowerCase();
      const participantB = (parts[1] || "").toLowerCase();

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
        messages: preload.slice(-PRELOAD_PER_CHANNEL).map((r) => ({
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

  // Fallback：chat_channels 空 → 從 messages 即時聚合
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
      messages: rows.slice(-PRELOAD_PER_CHANNEL).map((r) => ({
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

function buildPayload(map: Record<string, string>, rawData: TursoResponse): string {
  const metrics = map.metrics ? JSON.parse(map.metrics) : null;
  const members = sanitizeMembers(map.members ? JSON.parse(map.members) : {});
  const rawOs = map.member_os ? JSON.parse(map.member_os) : {};
  const taskQueue = map.task_queue ? JSON.parse(map.task_queue) : [];
  const meeting = map.meeting ? JSON.parse(map.meeting) : { active: false };
  const memberProfiles = map.member_profiles ? JSON.parse(map.member_profiles) : [];
  const chatSummaries = buildChatSummaries(rawData);

  const memberOs: Record<
    string,
    Array<{ text: string; task?: string; at?: string }>
  > = {};
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

  return JSON.stringify({ members, metrics, memberOs, taskQueue, meeting, memberProfiles, chatSummaries });
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastFingerprint = "";
      let alive = true;

      request.signal.addEventListener("abort", () => {
        alive = false;
      });

      try {
        const { map, rawData } = await tursoQuery();
        lastFingerprint = map.__fingerprint || "";
        const payload = buildPayload(map, rawData);
        controller.enqueue(
          encoder.encode(`event: status\ndata: ${payload}\n\n`)
        );
      } catch {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: "initial fetch failed" })}\n\n`
          )
        );
      }

      const poll = async () => {
        while (alive) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
          if (!alive) break;

          try {
            const { map, rawData } = await tursoQuery();
            const fingerprint = map.__fingerprint || "";

            if (fingerprint !== lastFingerprint) {
              lastFingerprint = fingerprint;
              const payload = buildPayload(map, rawData);
              controller.enqueue(
                encoder.encode(`event: status\ndata: ${payload}\n\n`)
              );
            }
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({ error: "poll failed" })}\n\n`
              )
            );
          }
        }

        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
