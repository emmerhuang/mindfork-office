"use client";

import { MemberData } from "@/types";

interface MemberCardProps {
  member: MemberData;
  onClose: () => void;
}

const statusLabels: Record<string, string> = {
  idle: "Idle",
  working: "Working",
  meeting: "In Meeting",
  sleeping: "Sleeping",
  celebrating: "Celebrating",
};

const statusColors: Record<string, string> = {
  idle: "bg-gray-500",
  working: "bg-green-500",
  meeting: "bg-blue-500",
  sleeping: "bg-purple-500",
  celebrating: "bg-yellow-500",
};

export default function MemberCard({ member, onClose }: MemberCardProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Card */}
      <div
        className="relative bg-gray-900 border-2 border-gray-600 rounded-lg p-5 max-w-sm w-full animate-float-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: `
            4px 0 0 0 ${member.primaryColor},
            -4px 0 0 0 ${member.primaryColor},
            0 4px 0 0 ${member.primaryColor},
            0 -4px 0 0 ${member.primaryColor}
          `,
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-3 text-gray-400 hover:text-white text-lg pixel-text"
        >
          X
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded flex items-center justify-center pixel-text text-white font-bold text-lg"
            style={{ background: member.primaryColor }}
          >
            {member.id === "waffles" ? "W" : member.name[0]}
          </div>
          <div>
            <h3 className="text-white pixel-text text-sm font-bold">
              {member.nameCn}
              {member.nameCn !== member.name && (
                <span className="text-gray-400 ml-2 text-xs">{member.name}</span>
              )}
            </h3>
            <p className="text-gray-400 text-xs pixel-text">{member.role}</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2 h-2 rounded-full ${statusColors[member.status]}`} />
          <span className="text-gray-300 text-xs pixel-text">
            {statusLabels[member.status]}
          </span>
        </div>

        {/* Description */}
        <p className="text-gray-300 text-xs mb-3 leading-relaxed">
          {member.description}
        </p>

        {/* Current task */}
        <div className="bg-gray-800 rounded p-2 mb-3">
          <p className="text-gray-400 text-[10px] pixel-text mb-1">CURRENT TASK</p>
          <p className="text-gray-200 text-xs">{member.currentTask}</p>
        </div>

        {/* Personality */}
        <div className="bg-gray-800 rounded p-2 mb-3">
          <p className="text-gray-400 text-[10px] pixel-text mb-1">PERSONALITY</p>
          <p className="text-gray-300 text-xs leading-relaxed">
            {member.personality}
          </p>
        </div>

        {/* Recent Tasks */}
        <div className="bg-gray-800 rounded p-2">
          <p className="text-gray-400 text-[10px] pixel-text mb-1">RECENT TASKS</p>
          <ul className="space-y-1">
            {member.recentTasks.map((task, i) => (
              <li key={i} className="text-gray-300 text-xs flex items-start gap-1.5">
                <span className="text-gray-500 pixel-text mt-px">&gt;</span>
                <span>{task}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
