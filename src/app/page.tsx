"use client";

import { useState, useEffect } from "react";
import Office from "@/components/Office";
import TeamPowerBar from "@/components/TeamPowerBar";
import QueueBar from "@/components/QueueBar";
import ProjectShowcase from "@/components/ProjectShowcase";
import SleepScene from "@/components/SleepScene";

export default function Home() {
  const [rateLimit, setRateLimit] = useState(65);
  const [pendingTasks, setPendingTasks] = useState(1);

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

  const teamPower = Math.max(0, 100 - rateLimit);
  const isSleeping = rateLimit >= 95;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="py-4 sm:py-6 text-center relative z-20">
        <h1 className="pixel-text text-xl sm:text-3xl font-bold tracking-wider">
          <span className="text-blue-800">Mind</span>
          <span className="text-orange-600">Fork</span>
          <span className="text-amber-900/60 ml-2">Office</span>
        </h1>
        <p className="text-amber-900/40 text-xs pixel-text mt-1">
          點擊成員查看詳細資訊
        </p>
      </header>

      {/* Status Bars */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-8 px-4 pb-4 relative z-20">
        <TeamPowerBar rateLimitPercent={rateLimit} />
        <QueueBar pendingTasks={pendingTasks} />
      </div>

      {/* Office scene or Sleep scene */}
      <main className="flex-1 flex items-start justify-center px-2 pb-6 relative z-10">
        {isSleeping ? <SleepScene /> : <Office />}
      </main>

      {/* Completed works showcase */}
      <section className="pb-6 relative z-20">
        <ProjectShowcase />
      </section>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-amber-700/20 relative z-20">
        <p className="text-amber-800/50 text-[10px] pixel-text">
          MindFork Team &middot; Pixel Office v0.4
        </p>
      </footer>
    </div>
  );
}
