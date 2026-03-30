import { NextRequest, NextResponse } from "next/server";
import { MemberStatus } from "@/types";

const TURSO_URL = process.env.TURSO_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

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

async function tursoExecute(
  statements: Array<{ sql: string; args?: Array<{ type: string; value: string }> }>
): Promise<TursoResponse> {
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

function rowsToMap(result: TursoResponse): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of result.results) {
    if (r.type === "ok" && r.response?.result?.rows) {
      for (const row of r.response.result.rows) {
        // row[0] = key, row[1] = value
        const key = row[0]?.value;
        const value = row[1]?.value;
        if (key) map[key] = value;
      }
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

// GET /api/status - read metrics and members from Turso
export async function GET() {
  try {
    const result = await tursoExecute([
      { sql: "SELECT key, value FROM mindfork_status WHERE key IN ('metrics', 'members', 'member_os')" },
    ]);

    const map = rowsToMap(result);

    const metrics = map.metrics
      ? JSON.parse(map.metrics)
      : { ...FALLBACK_METRICS };
    const members = map.members ? JSON.parse(map.members) : {};
    const rawOs = map.member_os ? JSON.parse(map.member_os) : {};
    // Normalize: legacy format has string values, new format has string[] values
    const memberOs: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(rawOs)) {
      memberOs[k] = Array.isArray(v) ? v as string[] : [v as string];
    }

    return NextResponse.json({ members, metrics, memberOs });
  } catch (err) {
    console.error("GET /api/status error:", err);
    return NextResponse.json({
      members: {},
      metrics: { ...FALLBACK_METRICS },
    });
  }
}

// POST /api/status - upsert metrics/members into Turso
// Requires Authorization: Bearer <MINDFORK_API_KEY>
export async function POST(request: NextRequest) {
  const apiKey = process.env.MINDFORK_API_KEY;
  const authHeader = request.headers.get("authorization");
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Read current state from Turso
    const current = await tursoExecute([
      { sql: "SELECT key, value FROM mindfork_status WHERE key IN ('metrics', 'members', 'member_os')" },
    ]);
    const map = rowsToMap(current);

    let metrics = map.metrics
      ? JSON.parse(map.metrics)
      : { ...FALLBACK_METRICS };
    let members = map.members ? JSON.parse(map.members) : {};

    // Update metrics fields if provided
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

    // Update member status if provided
    if (body.memberId) {
      const { memberId, status, task } = body;

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
        task: task || "",
        updatedAt: new Date().toISOString(),
      };
    }

    // Upsert both keys into Turso
    const now = new Date().toISOString();
    await tursoExecute([
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
    ]);

    return NextResponse.json({ ok: true, members, metrics });
  } catch (err) {
    console.error("POST /api/status error:", err);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
