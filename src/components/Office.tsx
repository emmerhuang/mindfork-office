"use client";

import { members } from "@/data/members";
import Workstation from "./Workstation";
import Bookshelf from "./Bookshelf";
import TeamPowerBar from "./TeamPowerBar";
import QueueBar from "./QueueBar";

import { MemberStatus } from "@/types";

interface OfficeProps {
  rateLimit: number;
  pendingTasks: number;
  memberStatuses?: Record<string, { status: MemberStatus; task: string }>;
}

export default function Office({ rateLimit, pendingTasks, memberStatuses = {} }: OfficeProps) {
  // Apply real-time status overrides from API
  const applyStatus = (m: typeof members[0]) => {
    const override = memberStatuses[m.id];
    if (override) {
      return { ...m, status: override.status, currentTask: override.task || m.currentTask };
    }
    return m;
  };

  const boss = applyStatus(members.find((m) => m.id === "boss")!);
  const secretary = applyStatus(members.find((m) => m.id === "secretary")!);
  const sherlock = applyStatus(members.find((m) => m.id === "sherlock")!);
  const lego = applyStatus(members.find((m) => m.id === "lego")!);
  const vault = applyStatus(members.find((m) => m.id === "vault")!);
  const forge = applyStatus(members.find((m) => m.id === "forge")!);
  const lens = applyStatus(members.find((m) => m.id === "lens")!);
  const waffles = applyStatus(members.find((m) => m.id === "waffles")!);

  return (
    <div className="w-full h-full flex items-start justify-center p-1 overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="bg-[#e8dcc8] rounded-xl border-2 border-[#8b7355] overflow-hidden shadow-lg">

          {/* Top bar: entrance */}
          <div className="bg-[#5b7a6a] px-3 py-1.5 flex items-center justify-between border-b-2 border-[#3d5548]">
            <div className="flex items-center gap-2">
              <span className="text-sm">🚪</span>
              <span className="pixel-text text-[9px] text-white/80">MINDFORK HQ</span>
            </div>
            <div className="flex gap-1 items-center">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-[8px] text-green-300 pixel-text">OPEN</span>
            </div>
          </div>

          {/* Wall section: bookshelf + status board — full width */}
          <div className="bg-[#d4c4a8] px-3 py-2 flex items-stretch gap-3 border-b border-[#b89868]">
            {/* Bookshelf (left half) */}
            <div className="flex-1 flex items-center gap-2">
              <Bookshelf />
              <span className="text-[8px] pixel-text text-amber-700/50">書櫃</span>
            </div>
            {/* Status board (right half) */}
            <div className="flex-1 bg-[#f5f0e0]/80 border border-[#b89868] rounded px-3 py-2 flex flex-col gap-1.5 justify-center">
              <TeamPowerBar rateLimitPercent={rateLimit} />
              <QueueBar pendingTasks={pendingTasks} />
            </div>
          </div>

          {/* Open office area */}
          <div className="bg-[#e2d6be] px-3 py-3 border-b border-[#b89868]">
            <span className="text-[8px] pixel-text text-amber-700/60 mb-2 block">💻 辦公區</span>

            {/* Boss + Waffles + Secretary */}
            <div className="flex items-end justify-center gap-4 mb-3">
              <Workstation member={boss} />
              <Workstation member={waffles} />
              <Workstation member={secretary} />
            </div>

            {/* Sherlock, Lego, Vault */}
            <div className="flex justify-center gap-4 mb-3">
              <Workstation member={sherlock} />
              <Workstation member={lego} />
              <Workstation member={vault} />
            </div>

            {/* Forge, Lens */}
            <div className="flex justify-center gap-4">
              <Workstation member={forge} />
              <Workstation member={lens} />
            </div>
          </div>

          {/* Meeting room + Break room side by side */}
          <div className="flex">
            {/* Meeting room */}
            <div className="flex-1 bg-[#d8ceb5] border-r border-[#b89868] p-3 relative">
              {/* Sliding door */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-[#8b7355] flex">
                <div className="flex-1 border-r border-[#6b5335] bg-[#a08060]" />
                <div className="flex-1 bg-[#a08060]" />
              </div>
              <span className="text-[8px] pixel-text text-amber-700/60 mt-1 block">📋 會議室</span>
              <div className="flex flex-col items-center mt-2 gap-1.5">
                <div className="w-20 h-7 bg-[#8b7355] rounded border border-[#6b5335] flex items-center justify-center">
                  <span className="text-[6px] text-amber-200/60 pixel-text">MEETING</span>
                </div>
                <div className="flex gap-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-3 h-3 bg-[#6b5335] rounded-sm border border-[#5a4325]" />
                  ))}
                </div>
                <div className="w-16 h-6 bg-white border-2 border-gray-300 rounded-sm">
                  <div className="flex gap-0.5 p-0.5">
                    <div className="w-2 h-0.5 bg-blue-400" />
                    <div className="w-3 h-0.5 bg-red-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Break room */}
            <div className="flex-1 bg-[#ddd4bf] p-3 relative">
              {/* Sliding door */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-[#8b7355] flex">
                <div className="flex-1 border-r border-[#6b5335] bg-[#a08060]" />
                <div className="flex-1 bg-[#a08060]" />
              </div>
              <span className="text-[8px] pixel-text text-amber-700/60 mt-1 block">☕ 茶水間</span>
              <div className="flex flex-col items-center mt-2 gap-2">
                <div className="flex gap-2 items-end">
                  <div className="w-6 h-8 bg-gray-700 rounded-t-sm border border-gray-600">
                    <div className="w-1.5 h-1 bg-red-400 mx-auto mt-1 rounded-full" />
                  </div>
                  <div className="w-5 h-9 bg-blue-200 rounded-t-lg border border-blue-300">
                    <div className="w-2.5 h-2.5 bg-blue-400 mx-auto mt-1 rounded-full" />
                  </div>
                  <div className="w-7 h-5 bg-gray-200 border border-gray-400 rounded-sm">
                    <div className="w-3 h-2.5 bg-gray-800 m-0.5 rounded-sm" />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-5 h-3 bg-amber-600 rounded-b-full" />
                  <div className="w-4 h-3 bg-green-600 rounded-full" />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
