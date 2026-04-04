import { NextRequest, NextResponse } from "next/server";

// ── In-memory rate limiter (per-minute) ──────────────────────
const RATE_LIMIT = 5; // max requests per minute
const rateBucket: number[] = []; // timestamps

function checkRateLimit(): boolean {
  const now = Date.now();
  // Remove entries older than 60s
  while (rateBucket.length > 0 && rateBucket[0] < now - 60_000) {
    rateBucket.shift();
  }
  if (rateBucket.length >= RATE_LIMIT) return false;
  rateBucket.push(now);
  return true;
}

// ── Turso helpers (same pattern as /api/status) ─────────────
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
        const key = row[0]?.value;
        const value = row[1]?.value;
        if (key) map[key] = value;
      }
    }
  }
  return map;
}

// ── Types ────────────────────────────────────────────────────

interface DialogueLine {
  speaker: "A" | "B" | string; // "A"/"B" or character id (legacy/new pool format)
  text: string;
}

interface PoolEntry {
  id: string;
  charA: string;
  charB: string;
  lines: DialogueLine[];
  used?: boolean; // legacy, no longer checked
  createdAt?: string; // ISO timestamp
}

interface RequestBody {
  charA: { id: string };
  charB: { id: string };
  excludeIds?: string[];
}

// ── Local fallback dialogues (from officeData characters) ────
// Kept minimal — client-side CharacterManager.getDialogue() handles
// the per-character pool; this is only for the API fallback path.

// ── Handler ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limit check
  if (!checkRateLimit()) {
    return NextResponse.json(
      { error: "Rate limited. Max 5 requests per minute." },
      { status: 429 },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { charA, charB, excludeIds = [] } = body;
  if (!charA?.id || !charB?.id) {
    return NextResponse.json(
      { error: "Missing charA or charB" },
      { status: 400 },
    );
  }

  try {
    // Read dialogue_pool and metrics from Turso (read-only)
    const result = await tursoExecute([
      { sql: "SELECT key, value FROM mindfork_status WHERE key IN ('dialogue_pool', 'metrics')" },
    ]);
    const map = rowsToMap(result);

    // Check rate limit from metrics — if > 80%, conserve resources
    if (map.metrics) {
      try {
        const metrics = JSON.parse(map.metrics);
        if (typeof metrics.rateLimitPercent === "number" && metrics.rateLimitPercent > 80) {
          return NextResponse.json(
            { error: "Service paused — rate limit > 80%" },
            { status: 503 },
          );
        }
      } catch {
        // metrics parse failed — continue anyway
      }
    }

    // Parse dialogue pool
    const allPool: PoolEntry[] = map.dialogue_pool
      ? JSON.parse(map.dialogue_pool)
      : [];

    // Filter: only dialogues created within the last 48 hours
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const excludeSet = new Set(excludeIds);
    const pool = allPool.filter((d) => {
      // Entries without createdAt are treated as epoch 0 (expired)
      const ts = d.createdAt ? new Date(d.createdAt).getTime() : 0;
      if (ts < cutoff) return false;
      if (excludeSet.has(d.id)) return false;
      return true;
    });

    // 1. Find matching dialogue (bidirectional match)
    let found: PoolEntry | undefined = pool.find(
      (d) =>
        (d.charA === charA.id && d.charB === charB.id) ||
        (d.charA === charB.id && d.charB === charA.id)
    );

    // 3. Return dialogue (read-only, no write-back to Turso)
    if (found) {
      // Normalize speakers to "A"/"B" format
      // Pool entries may use character IDs (new format) or "A"/"B" (legacy)
      const swapped = found.charA !== charA.id && found.charA === charB.id;
      const lines = found.lines.map((l) => {
        let speaker: "A" | "B";
        if (l.speaker === "A" || l.speaker === "B") {
          // Legacy format — flip if swapped
          speaker = swapped
            ? l.speaker === "A" ? "B" : "A"
            : l.speaker as "A" | "B";
        } else {
          // Character ID format — map to A/B based on charA.id/charB.id
          const isCharA = l.speaker === charA.id || (swapped && l.speaker === charB.id);
          speaker = isCharA ? "A" : "B";
        }
        return { speaker, text: l.text };
      });

      return NextResponse.json({ id: found.id, dialogue: lines });
    }

    // 4. No pool entries available — return null so client falls back
    return NextResponse.json({ id: null, dialogue: null });
  } catch (err) {
    console.error("[dialogue] Turso error:", err);
    // Turso failed — return null so client uses local fallback
    return NextResponse.json({ id: null, dialogue: null });
  }
}
