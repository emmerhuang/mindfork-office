"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

interface Project {
  name: string;
  url: string;
  description: string;
  color: string;
  version: string;
}

const projects: Project[] = [
  {
    name: "rotaryCredit",
    url: "https://rotarycredit.vercel.app",
    description: "扶輪信用稽核預警系統",
    color: "#c0392b",
    version: "v1.0.0",
  },
  {
    name: "account-rotary",
    url: "https://account-rotary.vercel.app",
    description: "扶輪會計系統",
    color: "#2980b9",
    version: "v0.1.0",
  },
  {
    name: "WaHoot Rotary",
    url: "https://wahoot-rotary.vercel.app",
    description: "互動問答系統",
    color: "#27ae60",
    version: "v1.0.0",
  },
  {
    name: "rotarysso",
    url: "https://rotarysso.vercel.app",
    description: "扶輪 SSO 單一登入",
    color: "#8e44ad",
    version: "v1.0.0",
  },
];

export default function Bookshelf() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {/* Bookshelf on wall - clickable */}
      <div
        className="cursor-pointer group"
        onClick={() => setShowModal(true)}
        title="點擊查看系統列表"
      >
        <div className="w-14 h-12 bg-[#6b4c30] rounded-t-sm border border-[#5a3c20] relative">
          {/* Shelf 1 */}
          <div className="flex gap-[2px] px-1 pt-1">
            {projects.map((p, i) => (
              <div
                key={i}
                className="w-2.5 h-4 rounded-t-[1px]"
                style={{ background: p.color }}
              />
            ))}
          </div>
          {/* Shelf divider */}
          <div className="h-px bg-[#5a3c20] mx-0.5 my-[2px]" />
          {/* Shelf 2 - decorative books */}
          <div className="flex gap-[2px] px-1">
            <div className="w-2 h-3 bg-[#d4a843]" />
            <div className="w-1.5 h-3 bg-[#1abc9c]" />
            <div className="w-2 h-3 bg-[#e67e22]" />
            <div className="w-1.5 h-3 bg-[#95a5a6]" />
          </div>
          {/* Hover glow */}
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors rounded-t-sm" />
        </div>
      </div>

      {/* Modal */}
      {showModal && <BookshelfModal onClose={() => setShowModal(false)} />}
    </>
  );
}

function BookshelfModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="member-card-overlay" onClick={onClose}>
      <div
        className="member-card-content animate-float-in"
        onClick={(e) => e.stopPropagation()}
        style={{ borderColor: "#6b4c30" }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-gray-400 hover:text-gray-700 text-xl"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-[#6b4c30] rounded-lg flex items-center justify-center">
            <span className="text-lg">📚</span>
          </div>
          <div>
            <h3 className="text-gray-900 text-lg font-bold pixel-text">
              SYSTEM SHELF
            </h3>
            <p className="text-gray-500 text-xs">MindFork 開發的系統</p>
          </div>
        </div>

        {/* Project list */}
        <div className="space-y-3">
          {projects.map((project) => (
            <a
              key={project.name}
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-all group"
            >
              {/* Book spine color */}
              <div
                className="w-3 h-10 rounded-sm shrink-0"
                style={{ background: project.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800 text-sm">
                    {project.name}
                  </span>
                  <span className="pixel-text text-[9px] text-gray-400">
                    {project.version}
                  </span>
                </div>
                <p className="text-gray-500 text-xs mt-0.5">
                  {project.description}
                </p>
              </div>
              <span className="text-gray-300 group-hover:text-gray-500 text-sm shrink-0">
                ↗
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
