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
  /** 預載的最新 N 筆訊息（ASC 排序）；上拉分頁時自動 prepend 更舊的 */
  messages: ChatMessage[];
  /** server 端該頻道未歸檔總筆數；用來判斷預載是否就是全部（< messages.length 時就沒得再撈）*/
  totalCount?: number;
  memberProfiles?: MemberProfile[];
  onBack: () => void;
}

/** 上拉觸發 threshold：scrollTop 小於此值時嘗試 fetch older */
const LOAD_MORE_THRESHOLD = 60; // px
const PAGE_SIZE = 50;

export function ChatRoom({
  channelId,
  participantA,
  participantB,
  messages: preload,
  totalCount,
  memberProfiles = [],
  onBack,
}: ChatRoomProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [pinnedRev, setPinnedRev] = useState(0);
  const isPinned = getPinnedChannels().includes(channelId);
  void pinnedRev;

  // Phase 2 分頁 state：本地 mutable 訊息陣列（preload + 上拉撈到的舊訊息）
  const [items, setItems] = useState<ChatMessage[]>(preload);
  const [loadingMore, setLoadingMore] = useState(false);
  // 預載即全部 → 沒得載；否則初始 has_more=true，第一次撈空了才 false
  const initialHasMore =
    typeof totalCount === "number" ? preload.length < totalCount : preload.length >= PAGE_SIZE;
  const [hasMore, setHasMore] = useState(initialHasMore);
  // 切到不同頻道時 reset
  useEffect(() => {
    setItems(preload);
    setHasMore(
      typeof totalCount === "number" ? preload.length < totalCount : preload.length >= PAGE_SIZE
    );
  }, [channelId, preload, totalCount]);

  // 父層 SSE 推新訊息時 sync：preload 變更且最後一筆 id 比目前大 → append
  useEffect(() => {
    if (preload.length === 0 || items.length === 0) return;
    const latestPreloadId = preload[preload.length - 1]?.id;
    const latestLocalId = items[items.length - 1]?.id;
    if (
      typeof latestPreloadId === "number" &&
      typeof latestLocalId === "number" &&
      latestPreloadId > latestLocalId
    ) {
      // 找出 preload 裡比 latestLocalId 新的訊息 append 進來
      const newer = preload.filter((m) => typeof m.id === "number" && m.id > latestLocalId);
      if (newer.length > 0) {
        setItems((prev) => [...prev, ...newer]);
      }
    }
  }, [preload, items]);

  const togglePin = useCallback(() => {
    const current = getPinnedChannels();
    const next = current.includes(channelId)
      ? current.filter((id) => id !== channelId)
      : [...current, channelId];
    setPinnedChannels(next);
    setPinnedRev((r) => r + 1);
  }, [channelId]);

  // 自動捲到最新（只在訊息變多時觸發；上拉載入舊訊息時靠 anchor 機制保位）
  const lastIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!scrollRef.current || items.length === 0) return;
    const newestId = items[items.length - 1]?.id;
    // 只在「最新一筆 id 變大」（=有新訊息進來）時 scrollToBottom
    if (typeof newestId === "number" && newestId !== lastIdRef.current) {
      // 但若是初次載入（lastIdRef=null），也捲到底
      if (lastIdRef.current === null || newestId > lastIdRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      lastIdRef.current = newestId;
    }
  }, [items]);

  // 上拉載入更舊訊息
  const fetchOlder = useCallback(async () => {
    if (loadingMore || !hasMore || items.length === 0) return;
    const oldestId = items[0]?.id;
    if (typeof oldestId !== "number" || oldestId <= 0) return; // 無 id 不能分頁

    setLoadingMore(true);
    const scrollEl = scrollRef.current;
    const prevScrollHeight = scrollEl?.scrollHeight || 0;
    const prevScrollTop = scrollEl?.scrollTop || 0;

    try {
      const url = new URL("/api/chat/messages", window.location.origin);
      url.searchParams.set("channel_id", channelId);
      url.searchParams.set("before_id", String(oldestId));
      url.searchParams.set("limit", String(PAGE_SIZE));

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const data: {
        messages: Array<{ id: number; sender: string; content: string; created_at: string }>;
        has_more: boolean;
      } = await res.json();

      if (!Array.isArray(data.messages) || data.messages.length === 0) {
        setHasMore(false);
        return;
      }

      // server 已 ASC 排序，prepend
      setItems((prev) => [...data.messages, ...prev]);
      setHasMore(Boolean(data.has_more));

      // 保留 scroll anchor：在 layout 完成後把 scrollTop 校正到「原本看的同一筆」
      requestAnimationFrame(() => {
        if (scrollEl) {
          const newScrollHeight = scrollEl.scrollHeight;
          scrollEl.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
        }
      });
    } catch {
      // 網路錯誤就先 disable，避免 loop
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [channelId, items, loadingMore, hasMore]);

  // 滾動偵測
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < LOAD_MORE_THRESHOLD && hasMore && !loadingMore) {
      fetchOlder();
    }
  }, [fetchOlder, hasMore, loadingMore]);

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
              backgroundImage: `url(/sprites/atlas/${normalizeMemberId(participantA)}.png)`,
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
              backgroundImage: `url(/sprites/atlas/${normalizeMemberId(participantB)}.png)`,
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
          {isPinned ? "❤" : "♡"}
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
      >
        {/* Loading more indicator at top */}
        {loadingMore && (
          <p className="text-gray-600 text-xs text-center py-1">載入更早的訊息...</p>
        )}
        {!hasMore && items.length > 0 && (
          <p className="text-gray-700 text-[10px] text-center py-1 italic">— 已是最舊訊息 —</p>
        )}
        {items.length === 0 ? (
          <p className="text-gray-600 text-xs text-center py-4">還沒有任何對話紀錄喔</p>
        ) : (
          items.map((msg, i) => {
            const senderNorm = normalizeMemberId(msg.sender);
            const isA = senderNorm === normalizeMemberId(participantA);
            const color = MEMBER_COLORS[senderNorm] || "#666";
            const bgColor = `${color}22`;
            const borderColor = `${color}44`;

            // 用 id（如果有）作 key，否則 fall back 到 created_at + index
            const key = typeof msg.id === "number" ? `m-${msg.id}` : `i-${i}-${msg.created_at}`;

            return (
              <div
                key={key}
                className={`flex ${isA ? "justify-start" : "justify-end"}`}
              >
                <div className={`flex items-end gap-1.5 max-w-[80%] ${isA ? "flex-row" : "flex-row-reverse"}`}>
                  <button
                    className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer"
                    style={{ imageRendering: "pixelated" as const }}
                    onClick={() => setSelectedMemberId(msg.sender)}
                    title={displayName(msg.sender)}
                  >
                    <div style={{
                      width: 24, height: 24,
                      backgroundImage: `url(/sprites/atlas/${senderNorm}.png)`,
                      backgroundSize: "auto 24px",
                      backgroundPosition: "0px 0px",
                      backgroundRepeat: "no-repeat",
                    }} />
                  </button>

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
