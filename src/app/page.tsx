"use client";

import { useState, useEffect } from "react";
import { MemberStatus } from "@/types";
import OfficeCanvas from "@/components/office-v3/OfficeCanvas";
import SleepScene from "@/components/SleepScene";
import packageJson from "../../package.json";

const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "dev";

interface Metrics {
  rateLimitPercent: number;
  pendingTasks: number;
  totalCostUsd?: number;
  modelName?: string;
  contextUsedPercent?: number;
  updatedAt?: string;
  resetAt?: string;
}

export default function Home() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [memberStatuses, setMemberStatuses] = useState<Record<string, { status: MemberStatus; task: string }>>({});
  const [memberOs, setMemberOs] = useState<Record<string, Array<{text: string; task?: string; at?: string}>>>({});
  const [taskQueue, setTaskQueue] = useState<Array<{id: number; task: string; status: string; assigned_to?: string; received_at?: string; note?: string}>>([]);
  const [meetingActive, setMeetingActive] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          const data = await res.json();
          if (data.metrics) setMetrics(data.metrics);
          if (data.members && Object.keys(data.members).length > 0) {
            const members: Record<string, { status: MemberStatus; task: string }> = data.members;
            // When meeting is active, override all member statuses to "meeting"
            if (data.meeting?.active) {
              for (const key of Object.keys(members)) {
                members[key] = { ...members[key], status: "meeting" };
              }
            }
            setMemberStatuses(members);
          }
          if (data.memberOs) setMemberOs(data.memberOs);
          if (data.taskQueue) setTaskQueue(data.taskQueue);
          if (data.meeting) setMeetingActive(!!data.meeting.active);
        }
      } catch { /* ignore */ }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, []);

  const power = metrics && metrics.rateLimitPercent >= 0 ? 100 - metrics.rateLimitPercent : null;
  const powerColor = power === null ? "#999" : power > 60 ? "#22c55e" : power > 30 ? "#eab308" : "#ef4444";
  const isSleeping = metrics ? metrics.rateLimitPercent >= 90 : false;

  return (
    <div className="h-screen w-screen bg-[#D4CFC8] flex flex-col overflow-auto">
      {/* Office Canvas — title rendered as watermark on floor */}
      <main className="flex-1 min-h-0">
        {isSleeping ? (
          <div className="h-full flex items-center justify-center">
            <SleepScene resetAt={metrics?.resetAt} />
          </div>
        ) : (
          <OfficeCanvas
            memberStatuses={memberStatuses}
            memberOs={memberOs}
            taskQueue={taskQueue}
            meetingActive={meetingActive}
            metrics={metrics ? {
              rateLimitPercent: metrics.rateLimitPercent,
              pendingTasks: metrics.pendingTasks,
              totalCostUsd: metrics.totalCostUsd,
              modelName: metrics.modelName,
              contextUsedPercent: metrics.contextUsedPercent,
            } : undefined}
            onCharacterClick={() => {}}
            className="w-full h-full"
          />
        )}
      </main>

      {/* Version info */}
      <div className="fixed bottom-1 right-1 text-[9px] text-white opacity-50 pointer-events-none" suppressHydrationWarning>
        v{packageJson.version} | {BUILD_TIME}
      </div>
    </div>
  );
}
