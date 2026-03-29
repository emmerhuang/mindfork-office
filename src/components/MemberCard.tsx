"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { MemberData } from "@/types";

interface MemberCardProps {
  member: MemberData;
  onClose: () => void;
}

const statusLabels: Record<string, string> = {
  idle: "待命（走動中）",
  working: "工作中",
  meeting: "開會中",
  sleeping: "休息中",
  celebrating: "慶祝中",
};

const statusColors: Record<string, string> = {
  idle: "bg-gray-400",
  working: "bg-green-500",
  meeting: "bg-blue-500",
  sleeping: "bg-purple-500",
  celebrating: "bg-yellow-500",
};

export default function MemberCard({ member, onClose }: MemberCardProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const card = (
    <div
      className="member-card-overlay"
      onClick={onClose}
    >
      <div
        className="member-card-content animate-float-in"
        onClick={(e) => e.stopPropagation()}
        style={{ borderColor: member.primaryColor }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-gray-400 hover:text-gray-700 text-xl"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-4 mb-5">
          <div
            className="w-14 h-14 rounded-lg flex items-center justify-center text-white font-bold text-2xl shrink-0"
            style={{ background: member.primaryColor }}
          >
            {member.id === "waffles" ? "🐕" : member.id === "boss" ? "👑" : member.name[0]}
          </div>
          <div>
            <h3 className="text-gray-900 text-xl font-bold">
              {member.nameCn}
              {member.nameCn !== member.name && (
                <span className="text-gray-400 ml-2 text-sm">{member.name}</span>
              )}
            </h3>
            <p className="text-gray-500 text-sm">{member.role}</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-3 h-3 rounded-full ${statusColors[member.status]}`} />
          <span className="text-gray-600 text-sm">{statusLabels[member.status]}</span>
        </div>

        {/* Personality */}
        <div className="bg-amber-50 rounded-lg p-4 mb-3">
          <p className="text-amber-700 text-xs pixel-text mb-2">個性</p>
          <p className="text-gray-700 text-sm leading-relaxed">{member.personality}</p>
        </div>

        {/* Current task */}
        <div className="bg-green-50 rounded-lg p-4 mb-3">
          <p className="text-green-700 text-xs pixel-text mb-2">目前任務</p>
          <p className="text-gray-700 text-sm">{member.currentTask}</p>
        </div>

        {/* Recent Tasks */}
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-blue-700 text-xs pixel-text mb-2">最近工作</p>
          <ul className="space-y-2">
            {member.recentTasks.map((task, i) => (
              <li key={i} className="text-gray-700 text-sm flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">▸</span>
                <span>{task}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(card, document.body);
}
