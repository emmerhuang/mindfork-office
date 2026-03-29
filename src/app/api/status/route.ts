import { NextRequest, NextResponse } from "next/server";
import { MemberStatus } from "@/types";

// In-memory status store (resets on cold start, which is fine for now)
const statusStore: Record<string, { status: MemberStatus; task: string; updatedAt: string }> = {};

// GET /api/status - return all member statuses
export async function GET() {
  return NextResponse.json(statusStore);
}

// POST /api/status - update a member's status
// Body: { memberId: string, status: MemberStatus, task?: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { memberId, status, task } = body;

    if (!memberId || !status) {
      return NextResponse.json(
        { error: "memberId and status are required" },
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

    return NextResponse.json({ ok: true, data: statusStore[memberId] });
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
