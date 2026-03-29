"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { members } from "@/data/members";
import MemberCard from "@/components/MemberCard";
import Bookshelf from "@/components/Bookshelf";
import TeamPowerBar from "@/components/TeamPowerBar";
import QueueBar from "@/components/QueueBar";
import SleepScene from "@/components/SleepScene";
import { MemberStatus, MemberData } from "@/types";

// Dynamic import Phaser (no SSR)
const PhaserGame = dynamic(() => import("@/components/PhaserGame"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#c4a87a]">
      <p className="pixel-text text-amber-800/60 text-sm">Loading office...</p>
    </div>
  ),
});

export default function Home() {
  const [rateLimit, setRateLimit] = useState(0);
  const [pendingTasks, setPendingTasks] = useState(3);
  const [memberStatuses, setMemberStatuses] = useState<Record<string, { status: MemberStatus; task: string }>>({});
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);

  // Poll /api/status every 15 seconds
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

  const handleMemberClick = useCallback((memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (member) {
      // Apply status overrides
      const override = memberStatuses[member.id];
      const merged = override
        ? { ...member, status: override.status, currentTask: override.task || member.currentTask }
        : member;
      setSelectedMember(merged);
    }
  }, [memberStatuses]);

  const isSleeping = rateLimit >= 90;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="py-1.5 sm:py-3 text-center relative z-20 shrink-0 landscape-header">
        <h1 className="pixel-text text-lg sm:text-2xl font-bold tracking-wider">
          <span className="text-blue-800">Mind</span>
          <span className="text-orange-600">Fork</span>
          <span className="text-amber-900/60 ml-1.5 text-sm sm:text-xl">Office</span>
        </h1>
      </header>

      {/* Main content */}
      <main className="flex-1 min-h-0 relative z-10">
        {isSleeping ? (
          <div className="h-full flex items-center justify-center">
            <SleepScene />
          </div>
        ) : (
          <div className="relative w-full h-full">
            {/* Phaser game canvas */}
            <PhaserGame
              memberStatuses={memberStatuses}
              onMemberClick={handleMemberClick}
            />

            {/* HUD overlay - top right */}
            <div className="absolute top-2 right-2 z-30 flex flex-col gap-2 pointer-events-auto">
              {/* Status bars */}
              <div className="bg-[#f5f0e0]/90 border border-[#b89868] rounded px-2 py-1.5 flex flex-col gap-1 min-w-[140px] sm:min-w-[180px]">
                <TeamPowerBar rateLimitPercent={rateLimit} />
                <QueueBar pendingTasks={pendingTasks} />
              </div>

              {/* Bookshelf button */}
              <div className="self-end">
                <Bookshelf />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-1 sm:py-2 text-center border-t border-amber-700/20 relative z-20 shrink-0 landscape-footer">
        <p className="text-amber-800/50 text-[9px] pixel-text">
          MindFork Team &middot; Pixel Office v2.0 (Phaser)
        </p>
      </footer>

      {/* Member Card Modal */}
      {selectedMember && (
        <MemberCard member={selectedMember} onClose={() => setSelectedMember(null)} />
      )}
    </div>
  );
}
