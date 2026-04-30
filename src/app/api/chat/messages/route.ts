import { NextRequest, NextResponse } from "next/server";

const TURSO_URL = process.env.TURSO_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

/**
 * GET /api/chat/messages
 *   ?channel_id=foo|bar          (required)
 *   &before_id=12345             (optional, exclusive cursor — return id < before_id)
 *   &limit=50                    (optional, default 50, max 200)
 *
 * 上拉分頁端點。
 *
 * 行為（簡化版，2026-04-30 老大 5635：30 天物理刪除，不再用 archived_at）：
 * - 排序 id DESC（最新在前），前端可 reverse 後 prepend
 * - 找不到/超界 → messages: [] 並回 has_more: false
 * - 沒帶 channel_id → 400
 *
 * 回傳：
 *   { messages: ChatMessage[], has_more: boolean, oldest_id: number | null }
 */

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

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channel_id");
  const beforeIdStr = url.searchParams.get("before_id");
  const limitStr = url.searchParams.get("limit");

  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  // limit clamp [1, 200]，default 50
  let limit = 50;
  if (limitStr) {
    const parsed = parseInt(limitStr, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, 200);
    }
  }

  // before_id 可選；無效就忽略（拿最新批）
  let beforeId: number | null = null;
  if (beforeIdStr) {
    const parsed = parseInt(beforeIdStr, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      beforeId = parsed;
    }
  }

  // 多撈一筆判斷 has_more
  const fetchLimit = limit + 1;

  let sql: string;
  let args: Array<{ type: string; value: string }>;
  if (beforeId !== null) {
    sql =
      "SELECT id, channel_id, sender, content, created_at FROM chat_messages " +
      "WHERE channel_id = ? AND id < ? " +
      "ORDER BY id DESC LIMIT ?";
    args = [
      { type: "text", value: channelId },
      { type: "integer", value: String(beforeId) },
      { type: "integer", value: String(fetchLimit) },
    ];
  } else {
    sql =
      "SELECT id, channel_id, sender, content, created_at FROM chat_messages " +
      "WHERE channel_id = ? " +
      "ORDER BY id DESC LIMIT ?";
    args = [
      { type: "text", value: channelId },
      { type: "integer", value: String(fetchLimit) },
    ];
  }

  try {
    const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TURSO_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ type: "execute", stmt: { sql, args } }],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`);
    }

    const data: TursoResponse = await res.json();
    const rows = data.results?.[0]?.response?.result?.rows || [];

    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;

    // server 回 ASC（最舊先，最新後）— 對齊現有 ChatRoom 渲染順序（top→bottom）
    const messages = visible
      .map((row) => ({
        id: parseInt(row[0]?.value || "0", 10),
        channel_id: row[1]?.value || "",
        sender: row[2]?.value || "",
        content: row[3]?.value || "",
        created_at: row[4]?.value || "",
      }))
      .sort((a, b) => a.id - b.id);

    const oldestId = messages.length > 0 ? messages[0].id : null;

    return NextResponse.json({
      messages,
      has_more: hasMore,
      oldest_id: oldestId,
    });
  } catch (err) {
    console.error("GET /api/chat/messages error:", err);
    return NextResponse.json({ messages: [], has_more: false, oldest_id: null }, { status: 200 });
  }
}
