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
    case "secretary":
      return { top: "#5a4a3a", front: "#4a3a2a" };
    case "forge":
      return { top: "#555", front: "#444" };
    case "waffles":
      return { top: "#8b6914", front: "#6b4c10" };
    default:
      return { top: "#8b7355", front: "#6b5335" };
  }
}

function DeskItems({ memberId }: { memberId: string }) {
  switch (memberId) {
    case "secretary":
      return (
        <div className="absolute -top-3 left-1 flex gap-0.5">
          {/* Multiple screens */}
          <div className="w-3 h-2.5 bg-blue-900 border border-gray-600 rounded-[1px]">
            <div className="w-1 h-0.5 bg-blue-400 mt-0.5 ml-0.5" />
          </div>
          <div className="w-3 h-2.5 bg-blue-900 border border-gray-600 rounded-[1px]">
            <div className="w-1 h-0.5 bg-green-400 mt-0.5 ml-0.5" />
          </div>
          <div className="w-3 h-2.5 bg-blue-900 border border-gray-600 rounded-[1px]">
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
