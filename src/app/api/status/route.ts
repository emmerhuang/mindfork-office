import { NextRequest, NextResponse } from "next/server";
import { MemberStatus } from "@/types";
import { readFileSync, writeFileSync } from "fs";

const STATUS_FILE = "/tmp/mindfork-status.json";

interface StatusData {
  members: Record<string, { status: MemberStatus; task: string; updatedAt: string }>;
  metrics: {
    rateLimitPercent: number;
    pendingTasks: number;
    updatedAt: string;
  };
}

const FALLBACK: StatusData = {
  members: {},
  metrics: {
    rateLimitPercent: -1,
    pendingTasks: -1,
    updatedAt: new Date().toISOString(),
  },
};

function readStatus(): StatusData {
  try {
    const raw = readFileSync(STATUS_FILE, "utf-8");
    return JSON.parse(raw) as StatusData;
  } catch {
    return structuredClone(FALLBACK);
  }
}

function writeStatus(data: StatusData): void {
  writeFileSync(STATUS_FILE, JSON.stringify(data), "utf-8");
}

// GET /api/status - return all member statuses + team metrics
export async function GET() {
  const data = readStatus();
  return NextResponse.json({
    members: data.members,
    metrics: data.metrics,
  });
}

// POST /api/status - update a member's status or team metrics
// Requires Authorization: Bearer <MINDFORK_API_KEY>
// Body for member: { memberId: string, status: MemberStatus, task?: string }
// Body for metrics: { rateLimitPercent?: number, pendingTasks?: number }
export async function POST(request: NextRequest) {
  // Auth check
  const apiKey = process.env.MINDFORK_API_KEY;
  const authHeader = request.headers.get("authorization");
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const data = readStatus();

    // Update team metrics if provided
    if (body.rateLimitPercent !== undefined || body.pendingTasks !== undefined) {
      if (body.rateLimitPercent !== undefined) {
        data.metrics.rateLimitPercent = body.rateLimitPercent;
      }
      if (body.pendingTasks !== undefined) {
        data.metrics.pendingTasks = Math.max(0, body.pendingTasks);
      }
      data.metrics.updatedAt = new Date().toISOString();
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

      data.members[memberId] = {
        status,
        task: task || "",
        updatedAt: new Date().toISOString(),
      };
    }

    writeStatus(data);

    return NextResponse.json({
      ok: true,
      members: data.members,
      metrics: data.metrics,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
