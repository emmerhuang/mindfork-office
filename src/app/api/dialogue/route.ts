import { NextRequest, NextResponse } from "next/server";

// ── Turso helpers (same pattern as /api/status) ─────────────
const TURSO_URL = process.env.TURSO_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

// ── Rate limiter (Turso-backed, sliding window) ──────────────
// Previously we used an in-memory array of timestamps. On Vercel each
// Lambda/Edge instance has its own memory, so spikes routed across
// multiple instances bypass the limit (Lens P1: ~25 reqs in 25s, only
// ~5 blocked when 70%+ should be).
//
// Storage layout in `mindfork_status`:
//   key   = `rate_limit:dialogue:<bucketKey>`
//   value = JSON `{ count, windowStart }`
const RATE_LIMIT = 5; // max requests per WINDOW_MS
const WINDOW_MS = 60_000; // sliding window length

interface RateBucketState {
  count: number;
  windowStart: number;
}

async function checkRateLimitTurso(bucketKey: string): Promise<boolean> {
  const now = Date.now();
  const tursoKey = `rate_limit:dialogue:${bucketKey}`;

  // Read current bucket
  let state: RateBucketState = { count: 0, windowStart: now };
  try {
    const result = await tursoExecute([
      {
        sql: "SELECT value FROM mindfork_status WHERE key = ?",
        args: [{ type: "text", value: tursoKey }],
      },
    ]);
    const raw = result.results?.[0]?.response?.result?.rows?.[0]?.[0]?.value;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RateBucketState>;
      if (
        typeof parsed.count === "number" &&
        typeof parsed.windowStart === "number"
      ) {
        state = { count: parsed.count, windowStart: parsed.windowStart };
      }
    }
  } catch {
    // Turso read failed — fail open is risky but failing closed would
    // also be wrong (would 429 every legit request during a Turso blip).
    // Pick fail-open: dialogue is non-critical traffic.
    return true;
  }

  // Reset window if expired
  if (now - state.windowStart >= WINDOW_MS) {
    state = { count: 0, windowStart: now };
  }

  if (state.count >= RATE_LIMIT) {
    return false;
  }

  state.count += 1;

  // Best-effort upsert (don't await long; errors don't block the request)
  try {
    const nowIso = new Date().toISOString();
    await tursoExecute([
      {
        sql: "INSERT INTO mindfork_status (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        args: [
          { type: "text", value: tursoKey },
          { type: "text", value: JSON.stringify(state) },
          { type: "text", value: nowIso },
        ],
      },
    ]);
  } catch {
    // Don't fail the request if write fails — return as if allowed.
  }

  return true;
}

/**
 * Build a rate-limit bucket key from the request. Prefer the Vercel-supplied
 * client IP; fall back to a global key so the limiter still applies (just
 * shared across all callers).
 */
function getBucketKey(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "global";
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
  // Rate limit check (Turso-backed; survives across Lambda instances)
  const bucketKey = getBucketKey(req);
  const allowed = await checkRateLimitTurso(bucketKey);
  if (!allowed) {
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
    // Read chat_summaries and metrics from Turso (read-only)
    const result = await tursoExecute([
      { sql: "SELECT key, value FROM mindfork_status WHERE key IN ('chat_summaries', 'metrics')" },
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

    // --- New path: try chat_summaries first ---
    interface ChatSummaryEntry {
      channel_id: string;
      participant_a: string;
      participant_b: string;
      last_at: string;
      messages: Array<{ sender: string; content: string; created_at: string }>;
    }
    const chatSummaries: ChatSummaryEntry[] = map.chat_summaries
      ? JSON.parse(map.chat_summaries)
      : [];

    const excludeSet = new Set(excludeIds);
    const pairKey = [charA.id, charB.id].sort().join("|");
    const chatMatch = chatSummaries.find((ch) => ch.channel_id === pairKey);

    if (chatMatch && chatMatch.messages.length > 0) {
      // Convert chat_summaries format to dialogue format
      const dialogueId = `chat_${pairKey}_${Date.now()}`;
      if (!excludeSet.has(dialogueId)) {
        const lines = chatMatch.messages.slice(-4).map((m) => ({
          speaker: m.sender === charA.id ? ("A" as const) : ("B" as const),
          text: m.content,
        }));
        return NextResponse.json({ id: dialogueId, dialogue: lines });
      }
    }

    // No matching chat summary — return null so client falls back
    return NextResponse.json({ id: null, dialogue: null });
  } catch (err) {
    console.error("[dialogue] Turso error:", err);
    // Turso failed — return null so client uses local fallback
    return NextResponse.json({ id: null, dialogue: null });
  }
}
