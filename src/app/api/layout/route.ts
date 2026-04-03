import { NextRequest, NextResponse } from "next/server";

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

// GET /api/layout — read layout from Turso
export async function GET() {
  try {
    const result = await tursoExecute([
      { sql: "SELECT value FROM mindfork_status WHERE key = 'layout'" },
    ]);

    const r = result.results[0];
    if (r?.type === "ok" && r.response?.result?.rows?.length > 0) {
      const value = r.response.result.rows[0][0]?.value;
      if (value) {
        return NextResponse.json({ layout: JSON.parse(value) });
      }
    }

    return NextResponse.json({ layout: null });
  } catch (err) {
    console.error("GET /api/layout error:", err);
    return NextResponse.json({ layout: null });
  }
}

// POST /api/layout — upsert layout to Turso (password auth)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { layout, password } = body;

    if (password !== "emmer99") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!layout || !layout.version || !layout.objects) {
      return NextResponse.json({ error: "Invalid layout data" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const result = await tursoExecute([
      {
        sql: "INSERT INTO mindfork_status (key, value, updated_at) VALUES ('layout', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        args: [
          { type: "text", value: JSON.stringify(layout) },
          { type: "text", value: now },
        ],
      },
    ]);

    // Check for Turso-level error
    const r = result.results[0];
    if (r?.type !== "ok") {
      console.error("Turso upsert error:", r);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/layout error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
