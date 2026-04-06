"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/types";

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

export interface ChatRoomProps {
  channelId: string;
  participantA: string;
  participantB: string;
  messages: ChatMessage[];
  onBack: () => void;
}

export function ChatRoom({ participantA, participantB, messages, onBack }: ChatRoomProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
          <div
            className="w-6 h-6 rounded-full overflow-hidden border border-gray-700"
            style={{ imageRendering: "pixelated" as const }}
          >
            <div style={{
              width: 24, height: 24,
              backgroundImage: `url(/sprites/atlas/${participantA}.png)`,
              backgroundSize: "auto 24px",
              backgroundPosition: "0px 0px",
              backgroundRepeat: "no-repeat",
            }} />
          </div>
          <div
            className="w-6 h-6 rounded-full overflow-hidden border border-gray-700"
            style={{ imageRendering: "pixelated" as const }}
          >
            <div style={{
              width: 24, height: 24,
              backgroundImage: `url(/sprites/atlas/${participantB}.png)`,
              backgroundSize: "auto 24px",
              backgroundPosition: "0px 0px",
              backgroundRepeat: "no-repeat",
            }} />
          </div>
        </div>
        <span className="text-gray-200 text-sm font-medium">
          {displayName(participantA)} & {displayName(participantB)}
        </span>
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
                  <div
                    className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-gray-700"
                    style={{ imageRendering: "pixelated" as const }}
                  >
                    <div style={{
                      width: 24, height: 24,
                      backgroundImage: `url(/sprites/atlas/${msg.sender}.png)`,
                      backgroundSize: "auto 24px",
                      backgroundPosition: "0px 0px",
                      backgroundRepeat: "no-repeat",
                    }} />
                  </div>

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
    </div>
  );
}
