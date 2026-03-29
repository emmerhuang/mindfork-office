"use client";

import { MemberData } from "@/types";

// Isometric desk with character-specific items
export default function Desk({ member }: { member: MemberData }) {
  const deskColor = getDeskColor(member.id);

  return (
    <div className="relative">
      {/* Desk top surface (isometric-ish) */}
      <div
        className="w-full h-6 rounded-sm"
        style={{
          background: deskColor.top,
          transform: "perspective(200px) rotateX(10deg)",
        }}
      />
      {/* Desk front */}
      <div
        className="w-full h-4 rounded-b-sm -mt-0.5"
        style={{ background: deskColor.front }}
      />
      {/* Desk items */}
      <DeskItems memberId={member.id} />
    </div>
  );
}

function getDeskColor(id: string): { top: string; front: string } {
  switch (id) {
    case "boss":
      return { top: "#6b4c3a", front: "#5a3c2a" };
    case "secretary":
      return { top: "#7a6a5a", front: "#6a5a4a" };
    case "forge":
      return { top: "#888", front: "#777" };
    case "waffles":
      return { top: "#c4a882", front: "#a08060" };
    default:
      return { top: "#c4a882", front: "#a08060" };
  }
}

function DeskItems({ memberId }: { memberId: string }) {
  switch (memberId) {
    case "boss":
      return (
        <div className="absolute -top-3 left-0 flex gap-1 items-end">
          {/* Coffee cup */}
          <div className="w-2 h-2.5 bg-amber-700 rounded-b-sm border border-amber-800" />
          {/* Big screen */}
          <div className="w-5 h-3 bg-gray-800 border border-gray-600 rounded-[1px]">
            <div className="w-3 h-1 bg-red-400 mt-0.5 ml-0.5" />
          </div>
        </div>
      );
    case "secretary":
      return (
        <div className="absolute -top-3 left-1 flex gap-0.5">
          {/* Multiple screens */}
          <div className="w-3 h-2.5 bg-gray-800 border border-gray-500 rounded-[1px]">
            <div className="w-1 h-0.5 bg-blue-400 mt-0.5 ml-0.5" />
          </div>
          <div className="w-3 h-2.5 bg-gray-800 border border-gray-500 rounded-[1px]">
            <div className="w-1 h-0.5 bg-green-400 mt-0.5 ml-0.5" />
          </div>
          <div className="w-3 h-2.5 bg-gray-800 border border-gray-500 rounded-[1px]">
            <div className="w-1 h-0.5 bg-yellow-400 mt-0.5 ml-0.5" />
          </div>
        </div>
      );
    case "sherlock":
      return (
        <div className="absolute -top-2 right-0 flex gap-1">
          {/* Sticky notes */}
          <div className="w-2 h-2 bg-yellow-300 rotate-3" />
          <div className="w-2 h-2 bg-pink-300 -rotate-6" />
          <div className="w-2 h-2 bg-green-300 rotate-1" />
        </div>
      );
    case "lego":
      return (
        <div className="absolute -top-3 left-0 flex gap-0.5 items-end">
          {/* Building blocks */}
          <div className="w-2 h-2 bg-orange-500" />
          <div className="w-2 h-3 bg-gray-500" />
          <div className="w-2 h-1.5 bg-orange-400" />
          {/* Blueprint */}
          <div className="w-4 h-3 bg-blue-200 ml-1 opacity-70 border border-blue-400" />
        </div>
      );
    case "vault":
      return (
        <div className="absolute -top-4 right-1">
          {/* Safe */}
          <div className="w-5 h-4 bg-gray-600 border border-gray-500 rounded-[1px] relative">
            <div className="w-1.5 h-1.5 rounded-full border border-yellow-500 absolute top-1 left-1.5" />
          </div>
        </div>
      );
    case "forge":
      return (
        <div className="absolute -top-3 left-0 flex gap-1 items-end">
          {/* Anvil */}
          <div className="w-4 h-2 bg-gray-500 rounded-t-sm" />
          {/* Sparks */}
          <div className="w-1 h-1 bg-orange-400 rounded-full opacity-75" />
          <div className="w-0.5 h-0.5 bg-yellow-300 rounded-full opacity-50" />
        </div>
      );
    case "lens":
      return (
        <div className="absolute -top-4 right-0">
          {/* Microscope */}
          <div className="relative">
            <div className="w-1 h-4 bg-gray-400 ml-2" />
            <div className="w-3 h-1 bg-gray-500 rounded-sm" />
            <div className="w-2 h-0.5 bg-blue-300 ml-0.5" />
          </div>
        </div>
      );
    case "waffles":
      return (
        <div className="absolute -top-2 left-0 flex gap-1">
          {/* Dog bowl */}
          <div className="w-3 h-1.5 bg-red-600 rounded-b-full" />
          {/* Toy bone */}
          <div className="w-3 h-1 bg-white rounded-full" />
        </div>
      );
    default:
      return null;
  }
}
