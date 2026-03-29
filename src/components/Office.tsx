"use client";

import { members } from "@/data/members";
import Workstation from "./Workstation";
import Bookshelf from "./Bookshelf";
import TeamPowerBar from "./TeamPowerBar";
import QueueBar from "./QueueBar";

interface OfficeProps {
  rateLimit: number;
  pendingTasks: number;
}

export default function Office({ rateLimit, pendingTasks }: OfficeProps) {
  const boss = members.find((m) => m.id === "boss")!;
  const secretary = members.find((m) => m.id === "secretary")!;
  const sherlock = members.find((m) => m.id === "sherlock")!;
  const lego = members.find((m) => m.id === "lego")!;
  const vault = members.find((m) => m.id === "vault")!;
  const forge = members.find((m) => m.id === "forge")!;
  const lens = members.find((m) => m.id === "lens")!;
  const waffles = members.find((m) => m.id === "waffles")!;

  return (
    <div className="w-full h-full flex items-center justify-center p-1 sm:p-2">
      <div className="w-full max-w-[900px] h-full max-h-[600px] office-container">
        <div className="bg-[#e8dcc8] rounded-xl border-2 border-[#8b7355] overflow-hidden shadow-lg h-full flex flex-col">

          {/* Top bar: entrance */}
          <div className="bg-[#5b7a6a] px-3 py-1 landscape-header flex items-center justify-between border-b-2 border-[#3d5548] shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm landscape-hide-text">🚪</span>
              <span className="pixel-text text-[9px] text-white/80">MINDFORK HQ</span>
            </div>
            <div className="flex gap-1 items-center">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-[8px] text-green-300 pixel-text">OPEN</span>
            </div>
          </div>

          {/* Main floor - horizontal */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* LEFT: Open office */}
            <div className="flex-1 bg-[#e2d6be] p-2 sm:p-3 relative flex flex-col">

              {/* Wall section with bookshelf + status board */}
              <div className="flex items-start justify-between mb-2 shrink-0">
                {/* Bookshelf on wall */}
                <div className="flex items-center gap-2">
                  <Bookshelf />
                  <span className="text-[7px] pixel-text text-amber-700/40 hidden sm:inline">LIBRARY</span>
                </div>

                {/* Status board (top-right corner) */}
                <div className="bg-[#f5f0e0]/80 border border-[#b89868] rounded px-2 py-1 flex flex-col gap-1 status-board">
                  <span className="text-[7px] pixel-text text-amber-700/50 leading-none">戰情看板</span>
                  <div className="scale-[0.7] origin-top-left -ml-2">
                    <TeamPowerBar rateLimitPercent={rateLimit} />
                  </div>
                  <div className="scale-[0.7] origin-top-left -ml-2 -mt-2">
                    <QueueBar pendingTasks={pendingTasks} />
                  </div>
                </div>
              </div>

              {/* Office area label */}
              <div className="flex items-center gap-1 mb-1 shrink-0">
                <span className="text-[8px] pixel-text text-amber-700/60">💻 辦公區</span>
              </div>

              {/* Characters area - flex grow to fill */}
              <div className="flex-1 flex flex-col justify-center gap-2 sm:gap-3 min-h-0">
                {/* Boss row + Waffles beside boss */}
                <div className="flex items-end justify-center gap-4 sm:gap-6">
                  <Workstation member={boss} />
                  <div className="relative">
                    <Workstation member={waffles} />
                  </div>
                  <Workstation member={secretary} />
                </div>

                {/* Team row 1 */}
                <div className="flex justify-center gap-4 sm:gap-6">
                  <Workstation member={sherlock} />
                  <Workstation member={lego} />
                  <Workstation member={vault} />
                </div>

                {/* Team row 2 */}
                <div className="flex justify-center gap-4 sm:gap-6">
                  <Workstation member={forge} />
                  <Workstation member={lens} />
                </div>
              </div>
            </div>

            {/* RIGHT: Meeting room (top) + Break room (bottom) */}
            <div className="w-[160px] sm:w-[200px] shrink-0 border-l-2 border-[#b89868] flex flex-col landscape-sidebar">

              {/* Meeting room */}
              <div className="bg-[#d8ceb5] border-b-2 border-[#b89868] p-2 sm:p-3 flex-1">
                <span className="text-[8px] pixel-text text-amber-700/60">📋 會議室</span>
                <div className="flex flex-col items-center mt-2 sm:mt-3 gap-1.5 sm:gap-2">
                  {/* Meeting table */}
                  <div className="w-20 sm:w-24 h-8 sm:h-10 bg-[#8b7355] rounded border border-[#6b5335] flex items-center justify-center">
                    <span className="text-[6px] sm:text-[7px] text-amber-200/60 pixel-text">MEETING TABLE</span>
                  </div>
                  {/* Chairs */}
                  <div className="flex justify-between w-24 sm:w-28">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="w-3 sm:w-4 h-3 sm:h-4 bg-[#6b5335] rounded-sm border border-[#5a4325]" />
                    ))}
                  </div>
                  {/* Whiteboard */}
                  <div className="w-16 sm:w-20 h-6 sm:h-8 bg-white border-2 border-gray-300 rounded-sm mt-1">
                    <div className="flex gap-0.5 p-1">
                      <div className="w-3 h-0.5 bg-blue-400" />
                      <div className="w-4 h-0.5 bg-red-400" />
                    </div>
                    <div className="flex gap-0.5 px-1">
                      <div className="w-5 h-0.5 bg-green-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Break room */}
              <div className="bg-[#ddd4bf] p-2 sm:p-3 flex-1">
                <span className="text-[8px] pixel-text text-amber-700/60">☕ 茶水間</span>
                <div className="flex flex-col items-center mt-2 sm:mt-3 gap-2 sm:gap-3">
                  {/* Appliances row */}
                  <div className="flex gap-2 sm:gap-3 items-end">
                    {/* Coffee machine */}
                    <div className="flex flex-col items-center">
                      <div className="w-6 sm:w-7 h-7 sm:h-9 bg-gray-700 rounded-t-sm border border-gray-600">
                        <div className="w-2 h-1.5 bg-red-400 mx-auto mt-1 rounded-full" />
                        <div className="w-3 sm:w-4 h-0.5 bg-gray-500 mx-auto mt-1" />
                      </div>
                      <span className="text-[5px] sm:text-[6px] text-gray-400 mt-0.5">咖啡機</span>
                    </div>
                    {/* Water cooler */}
                    <div className="flex flex-col items-center">
                      <div className="w-5 sm:w-6 h-8 sm:h-10 bg-blue-200 rounded-t-lg border border-blue-300">
                        <div className="w-2.5 sm:w-3 h-2.5 sm:h-3 bg-blue-400 mx-auto mt-1 rounded-full" />
                        <div className="w-1 h-1.5 sm:h-2 bg-gray-400 mx-auto mt-1" />
                      </div>
                      <span className="text-[5px] sm:text-[6px] text-gray-400 mt-0.5">飲水機</span>
                    </div>
                    {/* Microwave */}
                    <div className="flex flex-col items-center">
                      <div className="w-7 sm:w-8 h-5 sm:h-6 bg-gray-200 border border-gray-400 rounded-sm">
                        <div className="w-3 sm:w-4 h-2.5 sm:h-3 bg-gray-800 m-0.5 rounded-sm" />
                      </div>
                      <span className="text-[5px] sm:text-[6px] text-gray-400 mt-0.5">微波爐</span>
                    </div>
                  </div>
                  {/* Snack table */}
                  <div className="flex gap-2 items-end">
                    <div className="w-5 sm:w-6 h-3 sm:h-4 bg-amber-600 rounded-b-full border border-amber-700" />
                    <div className="w-4 sm:w-5 h-2.5 sm:h-3 bg-green-600 rounded-full border border-green-700" />
                    <div className="w-3 sm:w-4 h-4 sm:h-5 bg-yellow-200 border border-yellow-400 rounded-sm" />
                  </div>
                  <span className="text-[5px] sm:text-[6px] text-gray-400">零食區</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
