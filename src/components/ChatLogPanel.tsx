"use client";

import { useState } from "react";
import { ChatChannelSummary } from "@/types";

/** Map member id to display name (short) */
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

function displayName(id: string): string {
  return MEMBER_NAMES[id] || id;
}

function shortTime(iso: string): string {
  const match = iso.match(/(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function senderInitial(id: string): string {
  const name = MEMBER_NAMES[id];
  if (!name) return id.charAt(0).toUpperCase();
  // For CJK names, use first char; for English, use first letter
  return name.charAt(0).toUpperCase();
}

interface Props {
  summaries: ChatChannelSummary[];
}

export default function ChatLogPanel({ summaries }: Props) {
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

  if (summaries.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg p-3">
        <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Team Chat</div>
        <p className="text-gray-600 text-sm italic">
          目前還沒有對話紀錄，成員們碰到面就會開始聊天了
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-3">
      <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Team Chat</div>
      <div className="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto">
        {summaries.map((ch) => {
          const isExpanded = expandedChannel === ch.channel_id;
          // Preview: last 2 messages
          const previewMsgs = ch.messages.slice(-2);
          const allMsgs = ch.messages;

          return (
            <div
              key={ch.channel_id}
              className="border border-gray-800 rounded-md hover:border-gray-700 transition-colors"
            >
              {/* Header */}
              <button
                className="w-full text-left px-2.5 py-1.5 flex items-center justify-between"
                onClick={() =>
                  setExpandedChannel(isExpanded ? null : ch.channel_id)
                }
              >
                <span className="text-sm text-gray-300">
                  {displayName(ch.participant_a)} &amp;{" "}
                  {displayName(ch.participant_b)}
                </span>
                <span className="text-xs text-gray-600">
                  {shortTime(ch.last_at)}
                </span>
              </button>

              {/* Messages */}
              <div className="px-2.5 pb-2">
                {(isExpanded ? allMsgs : previewMsgs).map((msg, i) => (
                  <div key={i} className="flex gap-1.5 text-xs leading-relaxed">
                    <span className="text-cyan-500 shrink-0 w-4 text-right">
                      {senderInitial(msg.sender)}:
                    </span>
                    <span className="text-gray-400 break-words min-w-0">
                      {msg.content}
                    </span>
                  </div>
                ))}
                {!isExpanded && allMsgs.length > 2 && (
                  <p className="text-xs text-gray-600 mt-0.5 text-center">
                    ... {allMsgs.length - 2} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
