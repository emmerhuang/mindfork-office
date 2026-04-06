"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types";
import { MemberProfilePopover } from "./MemberProfilePopover";

export interface MemberProfile {
  id: string;
  name: string;
  nameCn: string;
  role: string;
  primaryColor: string;
  description?: string;
  selfIntro?: string;
}

const MEMBER_NAMES: Record<string, string> = {
  boss: "老大",
  secretary: "秘書長",
  sherlock: "Sherlock",
  lego: "Lego",
  vault: "Vault",
  forge: "Forge",
  lens: "Lens",
  waffles: "Waffles",
  grant: "Grant",
  mika: "Mika",
  yuki: "Yuki",
};

const MEMBER_COLORS: Record<string, string> = {
  boss: "#8B0000",
  secretary: "#1e3a5f",
  sherlock: "#C0392B",
  lego: "#E87D20",
  vault: "#2D5A3D",
  forge: "#6C3483",
  lens: "#2980B9",
  waffles: "#F39C12",
  grant: "#2C3E50",
  mika: "#C0C0C0",
  yuki: "#FFB7C5",
};

function displayName(id: string): string {
  return MEMBER_NAMES[id] || id;
}

function shortTime(iso: string): string {
  const match = iso.match(/(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

// --- localStorage helpers (shared key with ChatChannelList) ---
const LS_PINNED_KEY = "dashboard_chat_pinned";

function getPinnedChannels(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_PINNED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setPinnedChannels(ids: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_PINNED_KEY, JSON.stringify(ids));
}

export interface ChatRoomProps {
  channelId: string;
  participantA: string;
  participantB: string;
  messages: ChatMessage[];
  memberProfiles?: MemberProfile[];
  onBack: () => void;
}

export function ChatRoom({ channelId, participantA, participantB, messages, memberProfiles = [], onBack }: ChatRoomProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [pinnedRev, setPinnedRev] = useState(0);
  const isPinned = getPinnedChannels().includes(channelId);
  // suppress lint for pinnedRev dependency
  void pinnedRev;

  const togglePin = useCallback(() => {
    const current = getPinnedChannels();
    const next = current.includes(channelId)
      ? current.filter((id) => id !== channelId)
      : [...current, channelId];
    setPinnedChannels(next);
    setPinnedRev((r) => r + 1);
  }, [channelId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 shrink-0">
        <button
          className="text-gray-400 hover:text-white text-lg leading-none"
          onClick={onBack}
        >
          &lt;
        </button>
        <div className="flex -space-x-1.5">
          <button
            className="w-6 h-6 rounded-full overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer"
            style={{ imageRendering: "pixelated" as const }}
            onClick={() => setSelectedMemberId(participantA)}
            title={displayName(participantA)}
          >
            <div style={{
              width: 24, height: 24,
              backgroundImage: `url(/sprites/atlas/${participantA}.png)`,
              backgroundSize: "auto 24px",
              backgroundPosition: "0px 0px",
              backgroundRepeat: "no-repeat",
            }} />
          </button>
          <button
            className="w-6 h-6 rounded-full overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer"
            style={{ imageRendering: "pixelated" as const }}
            onClick={() => setSelectedMemberId(participantB)}
            title={displayName(participantB)}
          >
            <div style={{
              width: 24, height: 24,
              backgroundImage: `url(/sprites/atlas/${participantB}.png)`,
              backgroundSize: "auto 24px",
              backgroundPosition: "0px 0px",
              backgroundRepeat: "no-repeat",
            }} />
          </button>
        </div>
        <span className="text-gray-200 text-sm font-medium">
          {displayName(participantA)} & {displayName(participantB)}
        </span>
        <button
          className={`ml-auto text-sm cursor-pointer select-none transition-opacity ${
            isPinned ? "text-red-400 opacity-80 hover:opacity-100" : "text-gray-600 opacity-40 hover:opacity-80"
          }`}
          title={isPinned ? "取消收藏" : "收藏"}
          onClick={togglePin}
        >
          {isPinned ? "\u2764" : "\u2661"}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 ? (
          <p className="text-gray-600 text-xs text-center py-4">還沒有任何對話紀錄喔</p>
        ) : (
          messages.map((msg, i) => {
            const isA = msg.sender === participantA;
            const color = MEMBER_COLORS[msg.sender] || "#666";
            const bgColor = `${color}22`; // low opacity hex
            const borderColor = `${color}44`;

            return (
              <div
                key={i}
                className={`flex ${isA ? "justify-start" : "justify-end"}`}
              >
                <div className={`flex items-end gap-1.5 max-w-[80%] ${isA ? "flex-row" : "flex-row-reverse"}`}>
                  {/* Avatar */}
                  <button
                    className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer"
                    style={{ imageRendering: "pixelated" as const }}
                    onClick={() => setSelectedMemberId(msg.sender)}
                    title={displayName(msg.sender)}
                  >
                    <div style={{
                      width: 24, height: 24,
                      backgroundImage: `url(/sprites/atlas/${msg.sender}.png)`,
                      backgroundSize: "auto 24px",
                      backgroundPosition: "0px 0px",
                      backgroundRepeat: "no-repeat",
                    }} />
                  </button>

                  {/* Bubble */}
                  <div
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      isA ? "rounded-bl-none" : "rounded-br-none"
                    }`}
                    style={{
                      background: bgColor,
                      border: `1px solid ${borderColor}`,
                    }}
                  >
                    <p className="text-gray-200 text-xs font-medium mb-0.5" style={{ color }}>
                      {displayName(msg.sender)}
                    </p>
                    <p className="text-gray-300 text-sm leading-relaxed break-words">
                      {msg.content}
                    </p>
                    <p className="text-gray-600 text-[10px] mt-0.5 text-right">
                      {shortTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Read-only footer */}
      <div className="px-3 py-2 border-t border-gray-700 shrink-0">
        <p className="text-gray-600 text-xs text-center">唯讀模式</p>
      </div>

      {/* Profile Popover */}
      {selectedMemberId && (
        <MemberProfilePopover
          memberId={selectedMemberId}
          memberProfiles={memberProfiles}
          onClose={() => setSelectedMemberId(null)}
        />
      )}
    </div>
  );
}
