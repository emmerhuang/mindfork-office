import { NextRequest, NextResponse } from "next/server";

const TURSO_URL = process.env.TURSO_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

const CONV_KEY = "conv_bar_settings";
const PASSWORD = "emmer99";

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

// GET /api/conv-settings — read conv bar settings from Turso
export async function GET() {
  try {
    const result = await tursoExecute([
      {
        sql: "SELECT value FROM mindfork_status WHERE key = ?",
        args: [{ type: "text", value: CONV_KEY }],
      },
    ]);

    const row = result.results?.[0]?.response?.result?.rows?.[0];
    if (row && row[0]?.value) {
      return NextResponse.json(JSON.parse(row[0].value));
    }

    return NextResponse.json({});
  } catch (err) {
    console.error("GET /api/conv-settings error:", err);
    return NextResponse.json({});
  }
}

// POST /api/conv-settings — save conv bar settings to Turso (password protected)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.password !== PASSWORD) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const settings = body.settings;
    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "settings is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    await tursoExecute([
      {
        sql: "INSERT INTO mindfork_status (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        args: [
          { type: "text", value: CONV_KEY },
          { type: "text", value: JSON.stringify(settings) },
          { type: "text", value: now },
        ],
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/conv-settings error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
