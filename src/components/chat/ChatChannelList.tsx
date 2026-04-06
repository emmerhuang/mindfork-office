"use client";

import type { ChatChannelSummary } from "@/types";

/** Map member id to display name */
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
  return name.charAt(0).toUpperCase();
}

export interface ChatChannelListProps {
  summaries: ChatChannelSummary[];
  onSelectChannel: (channelId: string) => void;
  compact?: boolean;
}

export function ChatChannelList({ summaries, onSelectChannel, compact }: ChatChannelListProps) {
  if (summaries.length === 0) {
    return (
      <p className="text-gray-500 text-xs italic py-2">
        團隊還沒開始聊天，等碰撞對話開始就會出現在這裡
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {summaries.map((ch) => {
        const lastMsg = ch.messages.length > 0 ? ch.messages[ch.messages.length - 1] : null;
        const lastPreview = lastMsg
          ? `${senderInitial(lastMsg.sender)}: ${lastMsg.content.replace(/\n/g, " ")}`
          : "尚無對話";

        return (
          <button
            key={ch.channel_id}
            className={`w-full text-left rounded-md hover:bg-gray-700/50 transition-colors flex items-center gap-2 ${
              compact ? "px-2 py-1.5" : "px-3 py-2"
            }`}
            onClick={() => onSelectChannel(ch.channel_id)}
          >
            {/* Avatars */}
            <div className="flex -space-x-2 shrink-0">
              <div
                className="w-8 h-8 rounded-full overflow-hidden border-2 border-gray-800"
                style={{ imageRendering: "pixelated" as const }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    backgroundImage: `url(/sprites/atlas/${ch.participant_a}.png)`,
                    backgroundSize: `auto ${32}px`,
                    backgroundPosition: "0px 0px",
                    backgroundRepeat: "no-repeat",
                  }}
                />
              </div>
              <div
                className="w-8 h-8 rounded-full overflow-hidden border-2 border-gray-800"
                style={{ imageRendering: "pixelated" as const }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    backgroundImage: `url(/sprites/atlas/${ch.participant_b}.png)`,
                    backgroundSize: `auto ${32}px`,
                    backgroundPosition: "0px 0px",
                    backgroundRepeat: "no-repeat",
                  }}
                />
              </div>
            </div>

            {/* Name + preview */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className={`text-gray-200 font-medium truncate ${compact ? "text-xs" : "text-sm"}`}>
                  {displayName(ch.participant_a)} & {displayName(ch.participant_b)}
                </span>
                <span className="text-gray-600 text-xs shrink-0">
                  {shortTime(ch.last_at)}
                </span>
              </div>
              <p className="text-gray-500 text-xs truncate">
                {lastPreview}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
