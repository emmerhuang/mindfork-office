"use client";

import { useState, useEffect } from "react";
import Office from "@/components/Office";
import SleepScene from "@/components/SleepScene";
import { MemberStatus } from "@/types";

export default function Home() {
  const [rateLimit, setRateLimit] = useState(0);
  const [pendingTasks, setPendingTasks] = useState(3);
  const [memberStatuses, setMemberStatuses] = useState<Record<string, { status: MemberStatus; task: string }>>({});

  // Poll /api/status every 15 seconds (faster for real-time feel)
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          const data = await res.json();
          if (data.metrics) {
            setRateLimit(data.metrics.rateLimitPercent ?? 0);
            setPendingTasks(data.metrics.pendingTasks ?? 0);
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

  const isSleeping = rateLimit >= 90;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <header className="py-1.5 sm:py-3 text-center relative z-20 shrink-0 landscape-header">
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
          <Office rateLimit={rateLimit} pendingTasks={pendingTasks} memberStatuses={memberStatuses} />
        )}
      </main>

      <footer className="py-1 sm:py-2 text-center border-t border-amber-700/20 relative z-20 shrink-0 landscape-footer">
        <p className="text-amber-800/50 text-[9px] pixel-text">
          MindFork Team &middot; Pixel Office v1.6
        </p>
      </footer>
    </div>
  );
}
