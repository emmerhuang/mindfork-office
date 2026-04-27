import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { verifyAdminCookie } from "@/lib/admin-auth";

const TURSO_URL = process.env.TURSO_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

const MAP_OBJECTS_DIR = path.join(process.cwd(), "public", "sprites", "map-objects");
const RECYCLE_DIR = path.join(MAP_OBJECTS_DIR, "_recycle");

// ── Turso helpers (same pattern as /api/status) ─────────────

interface TursoResult {
  cols: Array<{ name: string }>;
  rows: Array<Array<{ type: string; value: string }>>;
}

interface TursoResponse {
  results: Array<{
    type: string;
    response: {
      type: string;
      result: TursoResult;
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

function getRows(result: TursoResponse, index: number = 0): Array<Record<string, string>> {
  const r = result.results[index];
  if (r?.type !== "ok" || !r.response?.result?.rows) return [];
  const cols = r.response.result.cols.map((c) => c.name);
  return r.response.result.rows.map((row) => {
    const obj: Record<string, string> = {};
    row.forEach((cell, i) => {
      obj[cols[i]] = cell.value;
    });
    return obj;
  });
}

// ── Auto-create table ───────────────────────────────────────

async function ensureTable(): Promise<void> {
  await tursoExecute([
    {
      sql: `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        filename TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
    },
  ]);
}

// ── Category inference from filename ────────────────────────

function inferCategory(filename: string): string {
  const name = filename.replace(/\.png$/i, "");
  if (/^floor-/.test(name)) return "floor";
  if (/^wall-/.test(name)) return "wall";
  if (/^(desk-|dog-bed|sofa-|filing-cabinet|printer)/.test(name)) return "office";
  if (/^(conference-|projector-|tv-screen|long-table-)/.test(name)) return "meeting";
  if (/^(vending-|water-|coffee-|kitchen-|bar-|fridge|fruit-|microwave|trash-|cafe-)/.test(name)) return "tearoom";
  if (/^(plant-|tree-|succulents|table-lamp|painting-)/.test(name)) return "decoration";
  if (/^emote-/.test(name)) return "emote";
  return "decoration"; // fallback
}

// ── Seed: scan public/sprites/map-objects/ into empty table ─

async function seedFromFilesystem(): Promise<void> {
  if (!fs.existsSync(MAP_OBJECTS_DIR)) return;

  const files = fs.readdirSync(MAP_OBJECTS_DIR).filter((f) => {
    if (f === "_recycle") return false;
    return /\.png$/i.test(f);
  });

  if (files.length === 0) return;

  const stmts = files.map((f) => {
    const name = f.replace(/\.png$/i, "");
    const id = name; // use filename stem as id
    const category = inferCategory(f);
    return {
      sql: "INSERT OR IGNORE INTO assets (id, name, category, filename) VALUES (?, ?, ?, ?)",
      args: [
        { type: "text" as const, value: id },
        { type: "text" as const, value: name },
        { type: "text" as const, value: category },
        { type: "text" as const, value: f },
      ],
    };
  });

  // Turso pipeline limit: batch in groups of 20
  for (let i = 0; i < stmts.length; i += 20) {
    await tursoExecute(stmts.slice(i, i + 20));
  }
}

// ── GET /api/assets ─────────────────────────────────────────

export async function GET() {
  try {
    await ensureTable();

    // Check if table is empty → seed
    const countResult = await tursoExecute([
      { sql: "SELECT COUNT(*) as cnt FROM assets" },
    ]);
    const rows = getRows(countResult);
    const count = parseInt(rows[0]?.cnt ?? "0", 10);

    if (count === 0) {
      await seedFromFilesystem();
    }

    // Fetch all assets
    const result = await tursoExecute([
      { sql: "SELECT id, name, category, filename, width, height, created_at FROM assets ORDER BY category, name" },
    ]);

    const assets = getRows(result);
    return NextResponse.json({ assets });
  } catch (err) {
    console.error("GET /api/assets error:", err);
    return NextResponse.json({ assets: [], error: String(err) }, { status: 500 });
  }
}

// ── POST /api/assets — upload new asset ─────────────────────

export async function POST(request: NextRequest) {
  try {
    if (!verifyAdminCookie(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, category, filename, width, height, imageData } = body;

    if (!name || !category || !filename) {
      return NextResponse.json({ error: "name, category, filename are required" }, { status: 400 });
    }

    await ensureTable();

    // Sanitize filename: only allow alphanumeric, dash, underscore, dot
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "");
    const finalFilename = safeFilename.endsWith(".png") ? safeFilename : `${safeFilename}.png`;

    // Write image to public/sprites/map-objects/
    if (imageData) {
      const buffer = Buffer.from(imageData, "base64");
      const filePath = path.join(MAP_OBJECTS_DIR, finalFilename);
      fs.writeFileSync(filePath, buffer);
    }

    // Insert into Turso
    const id = name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    await tursoExecute([
      {
        sql: "INSERT OR REPLACE INTO assets (id, name, category, filename, width, height) VALUES (?, ?, ?, ?, ?, ?)",
        args: [
          { type: "text", value: id },
          { type: "text", value: name },
          { type: "text", value: category },
          { type: "text", value: finalFilename },
          { type: "text", value: String(width ?? 0) },
          { type: "text", value: String(height ?? 0) },
        ],
      },
    ]);

    return NextResponse.json({ ok: true, id, filename: finalFilename });
  } catch (err) {
    console.error("POST /api/assets error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── DELETE /api/assets — soft-delete (move to _recycle) ─────

export async function DELETE(request: NextRequest) {
  try {
    if (!verifyAdminCookie(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await ensureTable();

    // Get filename before deleting from DB
    const result = await tursoExecute([
      {
        sql: "SELECT filename FROM assets WHERE id = ?",
        args: [{ type: "text", value: id }],
      },
    ]);
    const rows = getRows(result);
    const filename = rows[0]?.filename;

    // Delete from Turso
    await tursoExecute([
      {
        sql: "DELETE FROM assets WHERE id = ?",
        args: [{ type: "text", value: id }],
      },
    ]);

    // Move file to _recycle (not real delete)
    if (filename) {
      const srcPath = path.join(MAP_OBJECTS_DIR, filename);
      if (fs.existsSync(srcPath)) {
        if (!fs.existsSync(RECYCLE_DIR)) {
          fs.mkdirSync(RECYCLE_DIR, { recursive: true });
        }
        const destPath = path.join(RECYCLE_DIR, filename);
        fs.renameSync(srcPath, destPath);
      }
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("DELETE /api/assets error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
