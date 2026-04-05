"use client";

import { MemberProfile } from "@/types";
import CharacterSprite, { DESK_COORDS } from "./CharacterSprite";
import Bookshelf from "./Bookshelf";
import TeamPowerBar from "./TeamPowerBar";
import QueueBar from "./QueueBar";
import Desk from "./Desk";
import { MemberStatus } from "@/types";

interface OfficeProps {
  rateLimit: number;
  pendingTasks: number;
  memberStatuses?: Record<string, { status: MemberStatus; task: string }>;
  memberProfiles?: MemberProfile[];
}

export default function Office({ rateLimit, pendingTasks, memberStatuses = {}, memberProfiles = [] }: OfficeProps) {
  const allMembers = memberProfiles.map(p => {
    const override = memberStatuses[p.id];
    return {
      ...p,
      status: override?.status ?? ("idle" as MemberStatus),
      currentTask: override?.task || "",
    };
  });
  const humanMembers = allMembers.filter((m) => m.id !== "waffles");

  return (
    <div className="w-full h-full flex items-stretch justify-center p-1 overflow-hidden">
      <div className="w-full h-full max-w-lg">
        {/* Office container fills available height */}
        <div
          className="relative w-full h-full bg-[#c4a87a] rounded-xl border-2 border-[#8b7355] overflow-hidden shadow-lg"
        >
          {/* ================================================ */}
          {/* WALL ZONE - top ~28% */}
          {/* ================================================ */}
          <div
            className="absolute top-0 left-0 right-0"
            style={{ height: "28%", background: "linear-gradient(180deg, #5b7a6a 0%, #4a6858 100%)" }}
          >
            {/* Baseboard */}
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[#3d5548]" />

            {/* Window left */}
            <div className="absolute top-[18%] left-[6%] w-[14%] aspect-[4/3] border-2 border-[#8b7355] bg-[#87ceeb]/40 rounded-sm">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#8b7355]" />
              <div className="absolute left-0 right-0 top-1/2 h-px bg-[#8b7355]" />
            </div>

            {/* Window right */}
            <div className="absolute top-[18%] right-[6%] w-[14%] aspect-[4/3] border-2 border-[#8b7355] bg-[#87ceeb]/40 rounded-sm">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#8b7355]" />
              <div className="absolute left-0 right-0 top-1/2 h-px bg-[#8b7355]" />
            </div>

            {/* Title bar */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              <span className="text-[8px] sm:text-[9px] pixel-text text-white/80">MINDFORK HQ</span>
              <div className="flex gap-0.5 items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-[7px] text-green-300 pixel-text">OPEN</span>
              </div>
            </div>

            {/* Bookshelf - on wall, left */}
            <div className="absolute bottom-3 left-[24%]" style={{ zIndex: 5 }}>
              <Bookshelf />
            </div>

            {/* Status board - on wall, right */}
            <div
              className="absolute bottom-2 right-[8%] w-[38%] bg-[#f5f0e0]/90 border border-[#b89868] rounded px-2 py-1.5 flex flex-col gap-1"
              style={{ zIndex: 5 }}
            >
              <TeamPowerBar rateLimitPercent={rateLimit} />
              <QueueBar pendingTasks={pendingTasks} />
            </div>

            {/* Wall clock */}
            <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-[#8b7355] bg-[#f5f0e0]">
              <div className="absolute top-1/2 left-1/2 w-px h-2 bg-gray-700 -translate-x-1/2 origin-bottom -rotate-12" />
              <div className="absolute top-1/2 left-1/2 w-px h-1.5 bg-gray-700 -translate-x-1/2 origin-bottom rotate-45" />
            </div>
          </div>

          {/* ================================================ */}
          {/* FLOOR ZONE - bottom ~72% */}
          {/* ================================================ */}
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: "72%",
              background: `repeating-linear-gradient(
                90deg,
                #c4a87a 0px, #c4a87a 60px,
                #b89868 60px, #b89868 61px,
                #c9ad80 61px, #c9ad80 120px,
                #b89868 120px, #b89868 121px
              )`,
            }}
          >
            {/* Plank horizontal lines */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent 0px, transparent 19px, #b8986855 19px, #b8986855 20px)",
              }}
            />
          </div>

          {/* ================================================ */}
          {/* OFFICE AREA LABEL */}
          {/* ================================================ */}
          <div className="absolute" style={{ top: "29%", left: "4%", zIndex: 5 }}>
            <span className="text-[7px] sm:text-[8px] pixel-text text-amber-700/50">OFFICE</span>
          </div>

          {/* ================================================ */}
          {/* MEETING ROOM - bottom left */}
          {/* ================================================ */}
          <div
            className="absolute border-t-2 border-r-2 border-[#8b7355] bg-[#d8ceb5]/60 rounded-tr-lg"
            style={{ bottom: 0, left: 0, width: "40%", height: "22%", zIndex: 2 }}
          >
            <span className="absolute top-1 left-2 text-[7px] pixel-text text-amber-700/50">MEETING</span>
            {/* Meeting table */}
            <div
              className="absolute top-[35%] left-1/2 -translate-x-1/2 w-[55%] h-[28%] bg-[#8b7355] rounded border border-[#6b5335] flex items-center justify-center"
              style={{ zIndex: 3 }}
            >
              <span className="text-[5px] text-amber-200/40 pixel-text">TABLE</span>
            </div>
            {/* Chairs */}
            <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 flex gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-2.5 h-2.5 bg-[#6b5335] rounded-sm border border-[#5a4325]" />
              ))}
            </div>
            {/* Whiteboard */}
            <div className="absolute top-1 right-2 w-8 h-5 bg-white border border-gray-300 rounded-sm">
              <div className="flex gap-0.5 p-0.5">
                <div className="w-1.5 h-0.5 bg-blue-400" />
                <div className="w-2 h-0.5 bg-red-400" />
              </div>
            </div>
          </div>

          {/* ================================================ */}
          {/* TEA ROOM - bottom right */}
          {/* ================================================ */}
          <div
            className="absolute border-t-2 border-l-2 border-[#8b7355] bg-[#ddd4bf]/60 rounded-tl-lg"
            style={{ bottom: 0, right: 0, width: "40%", height: "22%", zIndex: 2 }}
          >
            <span className="absolute top-1 left-2 text-[7px] pixel-text text-amber-700/50">TEA ROOM</span>
            {/* Coffee machine */}
            <div className="absolute top-[25%] right-[12%] flex gap-1 items-end">
              <div className="w-4 h-6 bg-gray-700 rounded-t-sm border border-gray-600">
                <div className="w-1.5 h-1 bg-red-400 mx-auto mt-0.5 rounded-full" />
              </div>
              <div className="w-3.5 h-7 bg-blue-200 rounded-t-lg border border-blue-300">
                <div className="w-2 h-2 bg-blue-400 mx-auto mt-0.5 rounded-full" />
              </div>
            </div>
            {/* Snacks */}
            <div className="absolute bottom-[18%] right-[15%] flex gap-1">
              <div className="w-3.5 h-2 bg-amber-600 rounded-b-full" />
              <div className="w-3 h-2 bg-green-600 rounded-full" />
            </div>
            {/* Microwave */}
            <div className="absolute top-[30%] left-[15%] w-5 h-4 bg-gray-200 border border-gray-400 rounded-sm">
              <div className="w-2.5 h-2 bg-gray-800 m-0.5 rounded-sm" />
            </div>
          </div>

          {/* ================================================ */}
          {/* WAFFLES DOG BED - near boss */}
          {/* ================================================ */}
          <div
            className="absolute"
            style={{
              left: "32%",
              top: "38%",
              transform: "translate(-50%, 0)",
              zIndex: 4,
            }}
          >
            <div className="w-10 h-4 bg-amber-700 rounded-full border border-amber-800 relative">
              <div className="absolute inset-0.5 bg-amber-200 rounded-full" />
            </div>
            <div className="flex gap-1 justify-center mt-0.5">
              <div className="w-2 h-1 bg-red-500 rounded-b-full" />
              <div className="w-2 h-0.5 bg-white rounded-full" />
            </div>
          </div>

          {/* ================================================ */}
          {/* DESKS - static furniture */}
          {/* ================================================ */}
          {humanMembers.map((m) => {
            const deskPos = DESK_COORDS[m.id];
            if (!deskPos) return null;
            return (
              <div
                key={`desk-${m.id}`}
                className="absolute"
                style={{
                  left: `${deskPos.x}%`,
                  top: `${deskPos.y}%`,
                  transform: "translate(-50%, 0)",
                  width: "13%",
                  zIndex: Math.round(deskPos.y) + 1,
                }}
              >
                <Desk member={m} />
              </div>
            );
          })}

          {/* ================================================ */}
          {/* CHARACTER SPRITES - animated, absolute positioned */}
          {/* ================================================ */}
          {allMembers.map((m) => (
            <CharacterSprite key={m.id} member={m} />
          ))}

          {/* ================================================ */}
          {/* Room divider lines */}
          {/* ================================================ */}
          {/* Horizontal line separating office from rooms */}
          <div
            className="absolute left-0 right-0 border-t border-dashed border-[#8b7355]/30"
            style={{ top: "78%", zIndex: 1 }}
          />
        </div>
      </div>
    </div>
  );
}
