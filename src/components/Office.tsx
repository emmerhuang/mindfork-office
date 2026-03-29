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
      <div className="min-w-[720px] max-w-[900px] mx-auto">
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

          {/* Main floor - horizontal */}
          <div className="flex">

            {/* LEFT: Open office (boss + team together, Waffles near boss) */}
            <div className="flex-1 bg-[#e2d6be] p-3 min-h-[280px]">
              <div className="flex items-center gap-1 mb-2">
                <span className="text-[8px] pixel-text text-amber-700/60">💻 辦公區</span>
              </div>

              {/* Boss row + Waffles beside boss */}
              <div className="flex items-end justify-center gap-6 mb-4">
                <Workstation member={boss} />
                <div className="relative">
                  <Workstation member={waffles} />
                </div>
                <Workstation member={secretary} />
              </div>

              {/* Team row 1 */}
              <div className="flex justify-center gap-6 mb-3">
                <Workstation member={sherlock} />
                <Workstation member={lego} />
                <Workstation member={vault} />
              </div>

              {/* Team row 2 */}
              <div className="flex justify-center gap-6">
                <Workstation member={forge} />
                <Workstation member={lens} />
              </div>
            </div>

            {/* RIGHT: Meeting room (top) + Break room (bottom) */}
            <div className="w-[200px] shrink-0 border-l-2 border-[#b89868] flex flex-col">

              {/* Meeting room - bigger */}
              <div className="bg-[#d8ceb5] border-b-2 border-[#b89868] p-3 flex-1">
                <span className="text-[8px] pixel-text text-amber-700/60">📋 會議室</span>
                <div className="flex flex-col items-center mt-3 gap-2">
                  {/* Long meeting table */}
                  <div className="w-24 h-10 bg-[#8b7355] rounded border border-[#6b5335] flex items-center justify-center">
                    <span className="text-[7px] text-amber-200/60 pixel-text">MEETING TABLE</span>
                  </div>
                  {/* Chairs */}
                  <div className="flex justify-between w-28">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="w-4 h-4 bg-[#6b5335] rounded-sm border border-[#5a4325]" />
                    ))}
                  </div>
                  {/* Whiteboard */}
                  <div className="w-20 h-8 bg-white border-2 border-gray-300 rounded-sm mt-1">
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

              {/* Break room / Tea room - bigger */}
              <div className="bg-[#ddd4bf] p-3 flex-1">
                <span className="text-[8px] pixel-text text-amber-700/60">☕ 茶水間</span>
                <div className="flex flex-col items-center mt-3 gap-3">
                  {/* Appliances row */}
                  <div className="flex gap-3 items-end">
                    {/* Coffee machine */}
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-9 bg-gray-700 rounded-t-sm border border-gray-600">
                        <div className="w-2 h-1.5 bg-red-400 mx-auto mt-1 rounded-full" />
                        <div className="w-4 h-0.5 bg-gray-500 mx-auto mt-1" />
                      </div>
                      <span className="text-[6px] text-gray-400 mt-0.5">咖啡機</span>
                    </div>
                    {/* Water cooler */}
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-10 bg-blue-200 rounded-t-lg border border-blue-300">
                        <div className="w-3 h-3 bg-blue-400 mx-auto mt-1 rounded-full" />
                        <div className="w-1 h-2 bg-gray-400 mx-auto mt-1" />
                      </div>
                      <span className="text-[6px] text-gray-400 mt-0.5">飲水機</span>
                    </div>
                    {/* Microwave */}
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-6 bg-gray-200 border border-gray-400 rounded-sm">
                        <div className="w-4 h-3 bg-gray-800 m-0.5 rounded-sm" />
                      </div>
                      <span className="text-[6px] text-gray-400 mt-0.5">微波爐</span>
                    </div>
                  </div>
                  {/* Snack table */}
                  <div className="flex gap-2 items-end">
                    <div className="w-6 h-4 bg-amber-600 rounded-b-full border border-amber-700" />
                    <div className="w-5 h-3 bg-green-600 rounded-full border border-green-700" />
                    <div className="w-4 h-5 bg-yellow-200 border border-yellow-400 rounded-sm" />
                  </div>
                  <span className="text-[6px] text-gray-400">零食區</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
