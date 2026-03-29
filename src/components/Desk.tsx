"use client";

import { MemberData } from "@/types";

// Monitor component reused across desks
function Monitor({ color = "#333" }: { color?: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-5 h-3.5 rounded-[1px] border border-gray-500" style={{ background: color }}>
        <div className="w-3 h-1.5 bg-blue-400/60 mt-0.5 mx-auto rounded-[0.5px]" />
      </div>
      <div className="w-1.5 h-1 bg-gray-500" />
      <div className="w-3 h-0.5 bg-gray-400 rounded-full" />
    </div>
  );
}

function Laptop() {
  return (
    <div className="flex flex-col items-center">
      <div className="w-5 h-3 bg-gray-700 rounded-t-[1px] border border-gray-500">
        <div className="w-3 h-1 bg-green-400/50 mt-0.5 mx-auto rounded-[0.5px]" />
      </div>
      <div className="w-6 h-0.5 bg-gray-500 rounded-b-sm" />
    </div>
  );
}

export default function Desk({ member }: { member: MemberData }) {
  const deskColor = getDeskColor(member.id);

  return (
    <div className="relative">
      <div
        className="w-full h-6 rounded-sm"
        style={{
          background: deskColor.top,
          transform: "perspective(200px) rotateX(10deg)",
        }}
      />
      <div
        className="w-full h-4 rounded-b-sm -mt-0.5"
        style={{ background: deskColor.front }}
      />
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
    default:
      return { top: "#c4a882", front: "#a08060" };
  }
}

function DeskItems({ memberId }: { memberId: string }) {
  switch (memberId) {
    case "boss":
      return (
        <div className="absolute -top-4 left-0 flex gap-1 items-end">
          <Monitor color="#222" />
          <div className="w-2 h-2.5 bg-amber-700 rounded-b-sm border border-amber-800" />
        </div>
      );
    case "secretary":
      return (
        <div className="absolute -top-4 left-0 flex gap-0.5 items-end">
          <Monitor />
          <Monitor />
          <Monitor />
        </div>
      );
    case "sherlock":
      return (
        <div className="absolute -top-4 left-0 flex gap-1 items-end">
          <Laptop />
          <div className="flex gap-0.5">
            <div className="w-2 h-2 bg-yellow-300 rotate-3" />
            <div className="w-2 h-2 bg-pink-300 -rotate-6" />
          </div>
        </div>
      );
    case "lego":
      return (
        <div className="absolute -top-4 left-0 flex gap-1 items-end">
          <Laptop />
          <div className="w-4 h-3 bg-blue-200 opacity-70 border border-blue-400" />
        </div>
      );
    case "vault":
      return (
        <div className="absolute -top-4 left-0 flex gap-1 items-end">
          <Monitor color="#1a3a2a" />
          <div className="w-5 h-4 bg-gray-600 border border-gray-500 rounded-[1px] relative">
            <div className="w-1.5 h-1.5 rounded-full border border-yellow-500 absolute top-1 left-1.5" />
          </div>
        </div>
      );
    case "forge":
      return (
        <div className="absolute -top-4 left-0 flex gap-1 items-end">
          <Monitor color="#2c2c2c" />
          <Monitor color="#2c2c2c" />
        </div>
      );
    case "lens":
      return (
        <div className="absolute -top-4 left-0 flex gap-1 items-end">
          <Laptop />
          <div className="relative">
            <div className="w-1 h-4 bg-gray-400 ml-1.5" />
            <div className="w-3 h-1 bg-gray-500 rounded-sm" />
          </div>
        </div>
      );
    default:
      return null;
  }
}
