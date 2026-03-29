"use client";

import { members } from "@/data/members";
import Workstation from "./Workstation";

export default function Office() {
  const boss = members.find((m) => m.id === "boss")!;
  const secretary = members.find((m) => m.id === "secretary")!;
  const sherlock = members.find((m) => m.id === "sherlock")!;
  const lego = members.find((m) => m.id === "lego")!;
  const vault = members.find((m) => m.id === "vault")!;
  const forge = members.find((m) => m.id === "forge")!;
  const lens = members.find((m) => m.id === "lens")!;
  const waffles = members.find((m) => m.id === "waffles")!;

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="min-w-[700px] max-w-[900px] mx-auto">
        {/* Office building - horizontal layout */}
        <div className="bg-[#e8dcc8] rounded-xl border-2 border-[#8b7355] overflow-hidden shadow-lg">

          {/* Top bar */}
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

          {/* Main floor - horizontal sections */}
          <div className="flex">

            {/* Left: Boss office */}
            <div className="w-[140px] shrink-0 bg-[#d4c4a8] border-r-2 border-[#b89868] p-3 flex flex-col items-center">
              <span className="text-[8px] pixel-text text-amber-700/60 mb-2">👑 老大</span>
              <Workstation member={boss} />
            </div>

            {/* Center: Open office (main area) */}
            <div className="flex-1 bg-[#e2d6be] p-3">
              <div className="flex items-center gap-1 mb-2">
                <span className="text-[8px] pixel-text text-amber-700/60">💻 開放辦公區</span>
              </div>
              {/* 2 rows of team members */}
              <div className="flex justify-around mb-3">
                <Workstation member={secretary} />
                <Workstation member={sherlock} />
                <Workstation member={lego} />
              </div>
              <div className="flex justify-around">
                <Workstation member={vault} />
                <Workstation member={forge} />
                <Workstation member={lens} />
              </div>
            </div>

            {/* Right column: Meeting + Break + Waffles */}
            <div className="w-[130px] shrink-0 border-l-2 border-[#b89868] flex flex-col">
              {/* Meeting room */}
              <div className="bg-[#d8ceb5] border-b border-[#b89868] p-2 flex-1">
                <span className="text-[8px] pixel-text text-amber-700/60">📋 會議室</span>
                <div className="flex justify-center mt-2">
                  <div className="w-14 h-6 bg-[#8b7355] rounded-sm border border-[#6b5335] flex items-center justify-center">
                    <span className="text-[6px] text-amber-200/60 pixel-text">MEETING</span>
                  </div>
                </div>
              </div>
              {/* Break room */}
              <div className="bg-[#ddd4bf] border-b border-[#b89868] p-2 flex-1">
                <span className="text-[8px] pixel-text text-amber-700/60">☕ 茶水間</span>
                <div className="flex justify-center gap-1 mt-2 items-end">
                  <div className="w-4 h-5 bg-gray-600 rounded-t-sm border border-gray-500">
                    <div className="w-1 h-0.5 bg-red-400 mx-auto mt-0.5 rounded-full" />
                  </div>
                  <div className="w-3 h-6 bg-blue-200 rounded-t-lg border border-blue-300">
                    <div className="w-1.5 h-1.5 bg-blue-400 mx-auto mt-0.5 rounded-full" />
                  </div>
                </div>
              </div>
              {/* Waffles */}
              <div className="bg-[#e5dcc6] p-2">
                <span className="text-[8px] pixel-text text-amber-700/60">🐕</span>
                <div className="flex justify-center mt-1">
                  <Workstation member={waffles} />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
