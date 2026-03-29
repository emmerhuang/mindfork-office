"use client";

import { useState, useEffect } from "react";
import Office from "@/components/Office";
import SleepScene from "@/components/SleepScene";

export default function Home() {
  const [rateLimit, setRateLimit] = useState(0);
  const [pendingTasks, setPendingTasks] = useState(3);

  // Poll /api/status every 60 seconds
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          const data = await res.json();
          if (data.metrics) {
            setRateLimit(data.metrics.rateLimitPercent ?? 65);
            setPendingTasks(data.metrics.pendingTasks ?? 0);
          }
        }
      } catch { /* ignore */ }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, []);

  const isSleeping = rateLimit >= 90;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Header - minimal */}
      <header className="py-1.5 sm:py-3 text-center relative z-20 shrink-0 landscape-header">
        <h1 className="pixel-text text-lg sm:text-2xl font-bold tracking-wider">
          <span className="text-blue-800">Mind</span>
          <span className="text-orange-600">Fork</span>
          <span className="text-amber-900/60 ml-1.5 text-sm sm:text-xl">Office</span>
        </h1>
        <p className="text-amber-900/40 text-[9px] pixel-text mt-0.5 landscape-hide-text">
          點擊成員查看詳細資訊
        </p>
      </header>

      {/* Office scene or Sleep scene - fills remaining space */}
      <main className="flex-1 min-h-0 relative z-10">
        {isSleeping ? (
          <div className="h-full flex items-center justify-center">
            <SleepScene />
          </div>
        ) : (
          <Office rateLimit={rateLimit} pendingTasks={pendingTasks} />
        )}
      </main>

      {/* Footer - minimal */}
      <footer className="py-1 sm:py-2 text-center border-t border-amber-700/20 relative z-20 shrink-0 landscape-footer">
        <p className="text-amber-800/50 text-[9px] pixel-text">
          MindFork Team &middot; Pixel Office v1.0
        </p>
      </footer>
    </div>
  );
}
