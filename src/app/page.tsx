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
    <div className="h-screen w-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="py-1.5 text-center shrink-0">
        <h1 className="text-lg font-bold tracking-wider font-mono">
          <span className="text-blue-400">Mind</span>
          <span className="text-orange-400">Fork</span>
          <span className="text-gray-500 ml-1.5 text-sm">Office</span>
        </h1>
      </header>

      {/* Office Canvas */}
      <main className="flex-1 min-h-0">
        {isSleeping ? (
          <div className="h-full flex items-center justify-center">
            <SleepScene resetAt={metrics?.resetAt} />
          </div>
        ) : (
          <OfficeCanvas
            memberStatuses={memberStatuses}
            memberOs={memberOs}
            onCharacterClick={() => {}}
            className="w-full h-full"
          />
        )}
      </main>

      {/* Bottom Dashboard Panel (same style as /dashboard left block) */}
      {metrics && (
        <div className="shrink-0 bg-gray-900 border-t border-gray-800 px-4 py-2 font-mono text-white">
          <div className="grid grid-cols-[1fr_80px_80px_80px] gap-x-4 gap-y-0 items-center max-w-xl mx-auto">
            {/* Row 1: PWR bar + labels */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs w-8">PWR</span>
              <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                {power !== null && (
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${power}%`, background: powerColor }} />
                )}
              </div>
              <span className="text-xs font-bold w-10 text-right" style={{ color: powerColor }}>
                {power !== null ? `${power}%` : "--"}
              </span>
            </div>
            <span className="text-gray-500 text-xs text-center">TASKS</span>
            <span className="text-gray-500 text-xs text-center">MODEL</span>
            <span className="text-gray-500 text-xs text-center">COST</span>

            {/* Row 2: CTX bar + values */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs w-8">CTX</span>
              <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                {metrics.contextUsedPercent !== undefined && metrics.contextUsedPercent >= 0 && (
                  <div className="h-full rounded-full transition-all duration-700" style={{
                    width: `${metrics.contextUsedPercent}%`,
                    background: metrics.contextUsedPercent > 80 ? "#ef4444" : metrics.contextUsedPercent > 50 ? "#eab308" : "#22c55e"
                  }} />
                )}
              </div>
              <span className="text-xs font-bold w-10 text-right">
                {metrics.contextUsedPercent !== undefined && metrics.contextUsedPercent >= 0
                  ? `${metrics.contextUsedPercent}%` : "--"}
              </span>
            </div>
            <span className="text-white text-lg font-bold text-center">
              {metrics.pendingTasks >= 0 ? metrics.pendingTasks : "--"}
            </span>
            <span className="text-cyan-400 text-sm text-center">
              {metrics.modelName
                ? (metrics.modelName.match(/(Opus|Sonnet|Haiku)\s*[\d.]+/i)?.[0] ?? metrics.modelName.replace(/\s*\(.*?\)\s*/g, ""))
                : "--"}
            </span>
            <span className="text-amber-400 text-sm font-bold text-center">
              {metrics.totalCostUsd !== undefined && metrics.totalCostUsd >= 0
                ? `$${metrics.totalCostUsd.toFixed(0)}` : "--"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
