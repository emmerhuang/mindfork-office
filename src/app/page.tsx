"use client";

import { useState, useEffect } from "react";
import Bookshelf from "@/components/Bookshelf";
import TeamPowerBar from "@/components/TeamPowerBar";
import QueueBar from "@/components/QueueBar";
import SleepScene from "@/components/SleepScene";
import { MemberStatus } from "@/types";
import OfficeCanvas from "@/components/office-v3/OfficeCanvas";

interface Metrics {
  rateLimitPercent: number;
  pendingTasks: number;
  totalCostUsd?: number;
  modelName?: string;
  contextUsedPercent?: number;
}

export default function Home() {
  const [metrics, setMetrics] = useState<Metrics>({
    rateLimitPercent: -1,
    pendingTasks: -1,
  });
  const [memberStatuses, setMemberStatuses] = useState<Record<string, { status: MemberStatus; task: string }>>({});

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          const data = await res.json();
          if (data.metrics) {
            setMetrics({
              rateLimitPercent: data.metrics.rateLimitPercent ?? -1,
              pendingTasks: data.metrics.pendingTasks ?? -1,
              totalCostUsd: data.metrics.totalCostUsd,
              modelName: data.metrics.modelName,
              contextUsedPercent: data.metrics.contextUsedPercent,
            });
          }
          if (data.members && Object.keys(data.members).length > 0) {
            setMemberStatuses(data.members);
          }
        }
      } catch { /* ignore */ }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, []);

  const isSleeping = metrics.rateLimitPercent >= 90;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <header className="py-1 sm:py-2 text-center relative z-20 shrink-0 landscape-header">
        <h1 className="pixel-text text-lg sm:text-2xl font-bold tracking-wider">
          <span className="text-blue-800">Mind</span>
          <span className="text-orange-600">Fork</span>
          <span className="text-amber-900/60 ml-1.5 text-sm sm:text-xl">Office</span>
        </h1>
      </header>

      <main className="flex-1 min-h-0 relative z-10">
        {isSleeping ? (
          <div className="h-full flex items-center justify-center">
            <SleepScene />
          </div>
        ) : (
          <div className="relative w-full h-full">
            <OfficeCanvas
              memberStatuses={memberStatuses}
              onCharacterClick={() => {}}
              className="w-full h-full"
            />

            {/* HUD overlay - top right */}
            <div className="absolute top-2 right-2 z-30 flex flex-col gap-1.5 pointer-events-auto">
              {/* Power + Queue */}
              <div className="bg-[#f5f0e0]/92 border border-[#b89868] rounded-lg px-2.5 py-2 flex flex-col gap-1.5 min-w-[160px]">
                <TeamPowerBar rateLimitPercent={metrics.rateLimitPercent} />
                <QueueBar pendingTasks={metrics.pendingTasks} />
              </div>

              {/* Stats panel */}
              <div className="bg-[#f5f0e0]/92 border border-[#b89868] rounded-lg px-2.5 py-2 flex flex-col gap-0.5 min-w-[160px]">
                {/* Model */}
                {metrics.modelName && (
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] pixel-text text-amber-700/60">MODEL</span>
                    <span className="text-[9px] text-amber-900 font-medium">{metrics.modelName}</span>
                  </div>
                )}
                {/* Total cost */}
                {metrics.totalCostUsd !== undefined && metrics.totalCostUsd >= 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] pixel-text text-amber-700/60">COST</span>
                    <span className="text-[9px] text-amber-900 font-medium">${metrics.totalCostUsd.toFixed(2)}</span>
                  </div>
                )}
                {/* Context */}
                {metrics.contextUsedPercent !== undefined && metrics.contextUsedPercent >= 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[8px] pixel-text text-amber-700/60">CTX</span>
                    <div className="flex items-center gap-1">
                      <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${metrics.contextUsedPercent}%`,
                            background: metrics.contextUsedPercent > 80 ? "#ef4444" : metrics.contextUsedPercent > 50 ? "#facc15" : "#4ade80",
                          }}
                        />
                      </div>
                      <span className="text-[9px] text-amber-900">{metrics.contextUsedPercent}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bookshelf */}
              <div className="self-end">
                <Bookshelf />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-1 text-center border-t border-amber-700/20 relative z-20 shrink-0 landscape-footer">
        <p className="text-amber-800/50 text-[9px] pixel-text">
          MindFork Team &middot; Pixel Office v3.1
        </p>
      </footer>
    </div>
  );
}
