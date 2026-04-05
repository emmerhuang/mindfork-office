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

async function tursoQuery(): Promise<Record<string, string>> {
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
  const fingerprint = Object.keys(updatedAtMap)
    .sort()
    .map((k) => `${k}:${updatedAtMap[k]}`)
    .join("|");
  map.__fingerprint = fingerprint;

  return map;
}

function buildPayload(map: Record<string, string>): string {
  const metrics = map.metrics ? JSON.parse(map.metrics) : null;
  const members = map.members ? JSON.parse(map.members) : {};
  const rawOs = map.member_os ? JSON.parse(map.member_os) : {};
  const taskQueue = map.task_queue ? JSON.parse(map.task_queue) : [];
  const meeting = map.meeting ? JSON.parse(map.meeting) : { active: false };
  const memberProfiles = map.member_profiles ? JSON.parse(map.member_profiles) : [];

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

  return JSON.stringify({ members, metrics, memberOs, taskQueue, meeting, memberProfiles });
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
        const map = await tursoQuery();
        lastFingerprint = map.__fingerprint || "";
        const payload = buildPayload(map);
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
            const map = await tursoQuery();
            const fingerprint = map.__fingerprint || "";

            if (fingerprint !== lastFingerprint) {
              lastFingerprint = fingerprint;
              const payload = buildPayload(map);
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
