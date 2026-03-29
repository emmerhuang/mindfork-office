import { NextRequest, NextResponse } from "next/server";
import { MemberStatus } from "@/types";

// In-memory status store (resets on cold start, which is fine for now)
const statusStore: Record<string, { status: MemberStatus; task: string; updatedAt: string }> = {};

// Global metrics store
let teamMetrics = {
  rateLimitPercent: 0, // updated via POST from hook
  pendingTasks: 3,    // current pending count from task-queue.json
  updatedAt: new Date().toISOString(),
};

// GET /api/status - return all member statuses + team metrics
export async function GET() {
  return NextResponse.json({
    members: statusStore,
    metrics: teamMetrics,
  });
}

// POST /api/status - update a member's status or team metrics
// Body for member: { memberId: string, status: MemberStatus, task?: string }
// Body for metrics: { rateLimitPercent?: number, pendingTasks?: number }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Update team metrics if provided
    if (body.rateLimitPercent !== undefined || body.pendingTasks !== undefined) {
      if (body.rateLimitPercent !== undefined) {
        teamMetrics.rateLimitPercent = Math.max(0, Math.min(100, body.rateLimitPercent));
      }
      if (body.pendingTasks !== undefined) {
        teamMetrics.pendingTasks = Math.max(0, body.pendingTasks);
      }
      teamMetrics.updatedAt = new Date().toISOString();
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

      statusStore[memberId] = {
        status,
        task: task || "",
        updatedAt: new Date().toISOString(),
      };
    }

    return NextResponse.json({
      ok: true,
      members: statusStore,
      metrics: teamMetrics,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
