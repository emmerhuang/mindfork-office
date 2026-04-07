import { NextRequest } from "next/server";

const TURSO_URL = process.env.TURSO_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

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
          type: "execute",
          stmt: {
            sql: "SELECT id, channel_id, sender, recipient, content, created_at FROM chat_messages ORDER BY id DESC LIMIT 500",
          },
        },
        {
          type: "execute",
          stmt: {
            sql: "SELECT MAX(id) FROM chat_messages",
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

  for (const r of data.results) {
    if (r.type === "ok" && r.response?.result?.rows) {
      for (const row of r.response.result.rows) {
        const key = row[0]?.value;
        const value = row[1]?.value;
        const updatedAt = row[2]?.value;
        if (key) {
          map[key] = value;
          updatedAtMap[key] = updatedAt;
        }
      }
    }
  }

  // Build a fingerprint from updated_at values to detect changes
  // Also include chat_messages max id (result[2]) for change detection
  let chatMaxId = "0";
  const chatMaxResult = data.results[2];
  if (chatMaxResult?.type === "ok" && chatMaxResult.response?.result?.rows?.[0]) {
    chatMaxId = chatMaxResult.response.result.rows[0][0]?.value || "0";
  }

  const fingerprint = Object.keys(updatedAtMap)
    .sort()
    .map((k) => `${k}:${updatedAtMap[k]}`)
    .join("|") + `|chat_max:${chatMaxId}`;
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

function buildChatSummaries(data: TursoResponse): Array<{
  channel_id: string;
  participant_a: string;
  participant_b: string;
  last_at: string;
  messages: Array<{ sender: string; content: string; created_at: string }>;
}> {
  const chatResult = data.results[1];
  if (!chatResult || chatResult.type !== "ok" || !chatResult.response?.result?.rows) {
    return [];
  }

  const rows: ChatRow[] = chatResult.response.result.rows.map((row) => ({
    id: parseInt(row[0]?.value || "0", 10),
    channel_id: row[1]?.value || "",
    sender: row[2]?.value || "",
    recipient: row[3]?.value || "",
    content: row[4]?.value || "",
    created_at: row[5]?.value || "",
  }));

  const channelMap = new Map<string, ChatRow[]>();
  for (const row of rows) {
    if (!channelMap.has(row.channel_id)) {
      channelMap.set(row.channel_id, []);
    }
    channelMap.get(row.channel_id)!.push(row);
  }

  const summaries = [];
  for (const [channelId, channelRows] of channelMap) {
    channelRows.sort((a, b) => a.id - b.id);
    const parts = channelId.split("|");
    const participantA = parts[0] || "";
    const participantB = parts[1] || "";
    const lastRow = channelRows[channelRows.length - 1];
    summaries.push({
      channel_id: channelId,
      participant_a: participantA,
      participant_b: participantB,
      last_at: lastRow.created_at,
      messages: channelRows.map((r) => ({
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
  const members = map.members ? JSON.parse(map.members) : {};
  const rawOs = map.member_os ? JSON.parse(map.member_os) : {};
  const taskQueue = map.task_queue ? JSON.parse(map.task_queue) : [];
  const meeting = map.meeting ? JSON.parse(map.meeting) : { active: false };
  const memberProfiles = map.member_profiles ? JSON.parse(map.member_profiles) : [];
  const chatSummaries = buildChatSummaries(rawData);

  // Normalize memberOs (same logic as GET /api/status)
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

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        alive = false;
      });

      // Send initial data immediately
      try {
        const { map, rawData } = await tursoQuery();
        lastFingerprint = map.__fingerprint || "";
        const payload = buildPayload(map, rawData);
        controller.enqueue(
          encoder.encode(`event: status\ndata: ${payload}\n\n`)
        );
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: "initial fetch failed" })}\n\n`
          )
        );
      }

      // Poll loop: check for changes every POLL_INTERVAL
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
            // Send heartbeat to keep connection alive
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            // On error, send error event but keep connection alive
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
