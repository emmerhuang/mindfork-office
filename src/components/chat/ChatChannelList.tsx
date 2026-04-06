"use client";

import { useState, useCallback, useMemo } from "react";
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

// --- localStorage helpers (dashboard_chat_ prefix) ---

const LS_PINNED_KEY = "dashboard_chat_pinned";

function getReadTimestamp(channelId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(`dashboard_chat_read_${channelId}`);
  return raw ? Number(raw) : 0;
}

function markChannelRead(channelId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`dashboard_chat_read_${channelId}`, String(Date.now()));
}

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

function getUnreadCount(ch: ChatChannelSummary): number {
  if (ch.messages.length === 0) return 0;
  const readTs = getReadTimestamp(ch.channel_id);
  return ch.messages.filter((msg) => new Date(msg.created_at).getTime() > readTs).length;
}

function isUnread(ch: ChatChannelSummary): boolean {
  return getUnreadCount(ch) > 0;
}

export interface ChatChannelListProps {
  summaries: ChatChannelSummary[];
  onSelectChannel: (channelId: string) => void;
  compact?: boolean;
}

export function ChatChannelList({ summaries, onSelectChannel, compact }: ChatChannelListProps) {
  // Force re-render when pinned (heart) state changes
  const [pinnedRev, setPinnedRev] = useState(0);
  // Force re-render when read state changes
  const [readRev, setReadRev] = useState(0);

  const pinned = useMemo(() => getPinnedChannels(), [pinnedRev]);

  const togglePin = useCallback((channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = getPinnedChannels();
    const next = current.includes(channelId)
      ? current.filter((id) => id !== channelId)
      : [...current, channelId];
    setPinnedChannels(next);
    setPinnedRev((r) => r + 1);
  }, []);

  const handleSelect = useCallback((channelId: string) => {
    markChannelRead(channelId);
    setReadRev((r) => r + 1);
    onSelectChannel(channelId);
  }, [onSelectChannel]);

  // Sort: pinned first, then unread, then read. Within each group, newest first.
  const sorted = useMemo(() => {
    // Suppress lint: readRev is used to trigger recalculation
    void readRev;
    const pinnedSet = new Set(pinned);
    return [...summaries].sort((a, b) => {
      const aPinned = pinnedSet.has(a.channel_id) ? 1 : 0;
      const bPinned = pinnedSet.has(b.channel_id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aUnread = isUnread(a) ? 1 : 0;
      const bUnread = isUnread(b) ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;

      return new Date(b.last_at).getTime() - new Date(a.last_at).getTime();
    });
  }, [summaries, pinned, readRev]);

  if (summaries.length === 0) {
    return (
      <p className="text-gray-500 text-xs italic py-2">
        團隊還沒開始聊天，等碰撞對話開始就會出現在這裡
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {sorted.map((ch) => {
        const lastMsg = ch.messages.length > 0 ? ch.messages[ch.messages.length - 1] : null;
        const lastPreview = lastMsg
          ? `${senderInitial(lastMsg.sender)}: ${lastMsg.content.replace(/\n/g, " ")}`
          : "尚無對話";
        const unreadCount = getUnreadCount(ch);
        const unread = unreadCount > 0;
        const isPinned = pinned.includes(ch.channel_id);

        return (
          <button
            key={ch.channel_id}
            className={`group w-full text-left rounded-md hover:bg-gray-700/50 transition-colors flex items-center gap-2 ${
              compact ? "px-2 py-1.5" : "px-3 py-2"
            }`}
            onClick={() => handleSelect(ch.channel_id)}
          >
            {/* Heart toggle — leading position */}
            <span
              role="button"
              tabIndex={-1}
              className={`text-sm cursor-pointer select-none transition-opacity shrink-0 ${
                isPinned
                  ? "text-red-400 opacity-80 hover:opacity-100"
                  : "text-gray-600 opacity-0 group-hover:opacity-60 hover:!opacity-100"
              }`}
              title={isPinned ? "取消收藏" : "收藏"}
              onClick={(e) => togglePin(ch.channel_id, e)}
            >
              {isPinned ? "\u2764\uFE0F" : "\uD83E\uDD0D"}
            </span>

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
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Unread badge with count */}
                  {unreadCount > 0 && (
                    <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold shrink-0">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                  <span className="text-gray-600 text-xs">
                    {shortTime(ch.last_at)}
                  </span>
                </div>
              </div>
              <p className={`text-xs truncate ${unread ? "text-gray-300 font-medium" : "text-gray-500"}`}>
                {lastPreview}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
