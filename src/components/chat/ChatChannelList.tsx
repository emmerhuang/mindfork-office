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

function normalizeMemberId(id: string): string {
  return String(id || "").trim().toLowerCase();
}

function displayName(id: string): string {
  const norm = normalizeMemberId(id);
  return MEMBER_NAMES[norm] || id;
}

function shortTime(iso: string): string {
  const match = iso.match(/(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function senderInitial(id: string): string {
  const norm = normalizeMemberId(id);
  const name = MEMBER_NAMES[norm];
  if (!name) return id.charAt(0).toUpperCase();
  return name.charAt(0).toUpperCase();
}

// --- localStorage helpers (dashboard_chat_ prefix) ---

const LS_PINNED_KEY = "dashboard_chat_pinned";
const LS_FAV_ONLY_KEY = "dashboard_chat_fav_only";

/** Read the "only show favorites" toggle from localStorage. SSR-safe. */
export function getFavOnly(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LS_FAV_ONLY_KEY) === "1";
}

/** Persist the "only show favorites" toggle to localStorage. */
export function setFavOnly(on: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_FAV_ONLY_KEY, on ? "1" : "0");
}

function getReadTimestamp(channelId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(`dashboard_chat_read_${channelId}`);
  return raw ? Number(raw) : 0;
}

function markChannelRead(channelId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`dashboard_chat_read_${channelId}`, String(Date.now()));
}

/**
 * Mark all given channels as read by writing the current timestamp into
 * `dashboard_chat_read_<channel_id>` for each id. Pure localStorage operation,
 * SSR-safe (no-op on server). Caller is expected to bump a re-render token
 * (e.g. setReadRev) so unread badges recompute.
 *
 * @param channelIds list of channel ids to mark read
 * @returns number of channels written (0 on SSR or empty input)
 */
export function markAllChannelsRead(channelIds: string[]): number {
  if (typeof window === "undefined") return 0;
  if (!Array.isArray(channelIds) || channelIds.length === 0) return 0;
  const now = String(Date.now());
  let written = 0;
  for (const id of channelIds) {
    if (!id) continue;
    localStorage.setItem(`dashboard_chat_read_${id}`, now);
    written += 1;
  }
  return written;
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

/**
 * 計算未讀數。
 *
 * Phase 2 改版（2026-04-30）：
 * - 主路徑：用 ch.last_at vs localStorage 的 read_ts 比較。一個 boolean 加總式（要嘛 0 要嘛
 *   message_count，由 server 提供總筆數）— 因為 chat_channels 只給最後一筆，沒辦法精算
 *   「自上次讀後新增幾筆」。折衷：未讀就顯示總筆數作 badge（>99 顯示 99+）。
 * - Fallback：preload messages 還在時，仍可精算（保留舊行為）。當 messages 為「最新 50 筆預載」
 *   而非全部時，這個精算只在預載範圍內準確；超出範圍未讀數會少算，但 badge 仍會顯示「有未讀」。
 *
 * 設計反饋（給秘書長）：
 *   ChatChannelSummary 在 Phase 2 後 messages 不再是「全部」，導致 client 端無法精算未讀。
 *   要 100% 精準需要 server 在 chat_channels 表加 last_message_id，前端比對 last_read_id（也存 server）。
 *   這次先做粗 badge（顯示總筆數或 0），等老大回頭關心精度再升級。
 */
function getUnreadCount(ch: ChatChannelSummary): number {
  if (ch.messages.length === 0 && !ch.last_at) return 0;
  const readTs = getReadTimestamp(ch.channel_id);

  // Fallback：精算（適用於所有訊息都在預載內的情況）
  if (ch.messages.length > 0) {
    const precise = ch.messages.filter(
      (msg) => new Date(msg.created_at).getTime() > readTs
    ).length;
    if (precise > 0) return precise;
    // 精算 = 0，但要再 cross-check last_at（防止 messages 預載沒包含最新）
  }

  // 主路徑：last_at vs read_ts
  if (ch.last_at) {
    const lastAtMs = new Date(ch.last_at).getTime();
    if (lastAtMs > readTs) {
      // 有未讀，但無法精算 → 用 message_count 作 upper bound badge（>99 → 99+）
      return ch.message_count && ch.message_count > 0 ? Math.min(ch.message_count, 100) : 1;
    }
  }
  return 0;
}

function isUnread(ch: ChatChannelSummary): boolean {
  return getUnreadCount(ch) > 0;
}

export interface ChatChannelListProps {
  summaries: ChatChannelSummary[];
  onSelectChannel: (channelId: string) => void;
  compact?: boolean;
  /** When true, only show channels the user has pinned (hearted). */
  favOnly?: boolean;
}

export function ChatChannelList({ summaries, onSelectChannel, compact, favOnly }: ChatChannelListProps) {
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
  // If favOnly is set, filter to only pinned channels.
  const sorted = useMemo(() => {
    // Suppress lint: readRev is used to trigger recalculation
    void readRev;
    const pinnedSet = new Set(pinned);
    const filtered = favOnly
      ? summaries.filter((s) => pinnedSet.has(s.channel_id))
      : summaries;
    return [...filtered].sort((a, b) => {
      const aPinned = pinnedSet.has(a.channel_id) ? 1 : 0;
      const bPinned = pinnedSet.has(b.channel_id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aUnread = isUnread(a) ? 1 : 0;
      const bUnread = isUnread(b) ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;

      return new Date(b.last_at).getTime() - new Date(a.last_at).getTime();
    });
  }, [summaries, pinned, readRev, favOnly]);

  if (summaries.length === 0) {
    return (
      <p className="text-gray-500 text-xs italic py-2">
        團隊還沒開始聊天，等碰撞對話開始就會出現在這裡
      </p>
    );
  }

  if (favOnly && sorted.length === 0) {
    return (
      <p className="text-gray-500 text-xs italic py-2">
        還沒有收藏的頻道，點任一頻道前的愛心來收藏
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {sorted.map((ch) => {
        // Phase 2: 優先用 server 提供的 last_message + last_sender，沒有的話 fallback 到
        // messages[end]（chat_channels 表為空時的 fallback path）
        const lastSender = ch.last_sender
          ? ch.last_sender
          : ch.messages.length > 0
          ? ch.messages[ch.messages.length - 1].sender
          : "";
        const lastContent = ch.last_message
          ? ch.last_message
          : ch.messages.length > 0
          ? ch.messages[ch.messages.length - 1].content
          : "";
        const lastPreview = lastSender
          ? `${senderInitial(lastSender)}: ${lastContent.replace(/\n/g, " ")}`
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
                    backgroundImage: `url(/sprites/atlas/${normalizeMemberId(ch.participant_a)}.png)`,
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
                    backgroundImage: `url(/sprites/atlas/${normalizeMemberId(ch.participant_b)}.png)`,
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
