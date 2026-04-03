"use client";

import { useState, useEffect } from "react";
import { MemberStatus } from "@/types";
import OfficeCanvas from "@/components/office-v3/OfficeCanvas";
import SleepScene from "@/components/SleepScene";

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

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          const data = await res.json();
          if (data.metrics) setMetrics(data.metrics);
          if (data.members && Object.keys(data.members).length > 0) {
            setMemberStatuses(data.members);
          }
          if (data.memberOs) setMemberOs(data.memberOs);
          if (data.taskQueue) setTaskQueue(data.taskQueue);
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

      {/* Dashboard panel removed — access via Boss screen click */}
    </div>
  );
}
