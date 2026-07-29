import { NextRequest } from "next/server";
import {
  tursoDetect,
  tursoFetchFull,
  shouldFetchFull,
} from "./detect";

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


function buildPayload(map: Record<string, string>): string {
  const metrics = map.metrics ? JSON.parse(map.metrics) : null;
  const members = sanitizeMembers(map.members ? JSON.parse(map.members) : {});
  const rawOs = map.member_os ? JSON.parse(map.member_os) : {};
  const taskQueue = map.task_queue ? JSON.parse(map.task_queue) : [];
  const meeting = map.meeting ? JSON.parse(map.meeting) : { active: false };
  const memberProfiles = map.member_profiles ? JSON.parse(map.member_profiles) : [];

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
      // 記錄的是 cheap fingerprint（tursoDetect 口徑），與 full fetch 的 __fingerprint 不同格式。
      let lastCheapFingerprint = "";
      let alive = true;

      request.signal.addEventListener("abort", () => {
        alive = false;
      });

      // 首次連線：先取 cheap fingerprint 當基準，再撈一次完整資料推初始 payload。
      try {
        lastCheapFingerprint = await tursoDetect();
        const { map } = await tursoFetchFull();
        const payload = buildPayload(map);
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
            // 輕量偵測先行：只讀 3 個純量，不碰 1500 列。
            const cheapFingerprint = await tursoDetect();

            // 有變才撈重查詢。
            if (shouldFetchFull(cheapFingerprint, lastCheapFingerprint)) {
              lastCheapFingerprint = cheapFingerprint;
              const { map } = await tursoFetchFull();
              const payload = buildPayload(map);
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
