"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatChannelSummary } from "@/types";
import { ChatChannelList, getFavOnly, setFavOnly } from "./ChatChannelList";
import { ChatRoom, type MemberProfile } from "./ChatRoom";

// Phase B P2-2 (2026-04-22): persist minimize + last channel so user can
// resume the conversation after minimising to the corner bubble.
export const CHAT_OVERLAY_MIN_KEY = "chat_overlay_minimized";
export const CHAT_OVERLAY_LAST_CHANNEL_KEY = "chat_overlay_last_channel";

interface Props {
  summaries: ChatChannelSummary[];
  memberProfiles?: MemberProfile[];
  onClose: () => void;
  onExpandFullscreen?: () => void;
  /** Phase B P2-2: called when user clicks the minimise button.
   *  Parent is expected to hide the overlay and show a corner bubble;
   *  restoring the overlay should re-render ChatOverlay which will
   *  pick up the last channel from localStorage. */
  onMinimize?: () => void;
}

export function ChatOverlay({ summaries, memberProfiles = [], onClose, onExpandFullscreen, onMinimize }: Props) {
  // Hydrate last channel from localStorage on mount (Phase B P2-2).
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const v = window.localStorage.getItem(CHAT_OVERLAY_LAST_CHANNEL_KEY);
      return v && v.length > 0 ? v : null;
    } catch { return null; }
  });
  const [favOnly, setFavOnlyState] = useState(false);
  const selectedChannel = summaries.find((c) => c.channel_id === selectedChannelId);

  // Persist selected channel so minimise+restore returns to the same room.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (selectedChannelId) {
        window.localStorage.setItem(CHAT_OVERLAY_LAST_CHANNEL_KEY, selectedChannelId);
      } else {
        window.localStorage.removeItem(CHAT_OVERLAY_LAST_CHANNEL_KEY);
      }
    } catch { /* quota or disabled — ignore */ }
  }, [selectedChannelId]);

  useEffect(() => {
    setFavOnlyState(getFavOnly());
  }, []);

  const toggleFavOnly = useCallback(() => {
    setFavOnlyState((prev) => {
      const next = !prev;
      setFavOnly(next);
      return next;
    });
  }, []);

  // Push history state when overlay mounts so back closes overlay
  useEffect(() => {
    window.history.pushState({ chatOverlay: true }, "");

    const onPopState = (e: PopStateEvent) => {
      // If a room is open, go back to list
      if (selectedChannelId) {
        setSelectedChannelId(null);
        // Push again so the next back closes the overlay
        window.history.pushState({ chatOverlay: true }, "");
      } else {
        // No room open — close the whole overlay
        onClose();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId, onClose]);

  const openRoom = useCallback((id: string) => {
    setSelectedChannelId(id);
    window.history.pushState({ chatRoom: id }, "");
  }, []);

  const closeRoom = useCallback(() => {
    if (window.history.state?.chatRoom) {
      window.history.back();
    } else {
      setSelectedChannelId(null);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (window.history.state?.chatOverlay || window.history.state?.chatRoom) {
      window.history.back();
    } else {
      onClose();
    }
  }, [onClose]);

  // Swipe-up on title bar to expand fullscreen
  const touchStartY = useRef<number | null>(null);

  const handleTitleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTitleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    touchStartY.current = null;
    if (deltaY > 50 && onExpandFullscreen) {
      onExpandFullscreen();
    }
  }, [onExpandFullscreen]);

  return (
    <div
      className="absolute inset-0 bg-black/60 flex items-center justify-center z-10"
      onClick={handleClose}
    >
      <div
        className="relative bg-gray-900 border border-cyan-500 rounded-lg p-0 max-w-md w-full mx-4 max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ imageRendering: "auto" }}
      >
        {/* Floating minimise button — visible in both list & room views (Phase B P2-2) */}
        {onMinimize && selectedChannel && (
          <button
            className="absolute top-2 right-2 z-20 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-cyan-400 bg-gray-900/80 rounded"
            onClick={onMinimize}
            title="最小化"
            aria-label="最小化"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="19" x2="19" y2="19" />
            </svg>
          </button>
        )}
        {selectedChannel ? (
          <ChatRoom
            channelId={selectedChannel.channel_id}
            participantA={selectedChannel.participant_a}
            participantB={selectedChannel.participant_b}
            messages={selectedChannel.messages}
            memberProfiles={memberProfiles}
            onBack={closeRoom}
          />
        ) : (
          <>
            <div
              className="px-4 pt-4 pb-2 border-b border-gray-700 flex items-center justify-between"
              onTouchStart={handleTitleTouchStart}
              onTouchEnd={handleTitleTouchEnd}
            >
              <h2 className="text-sm font-bold text-cyan-400 font-mono tracking-wider">
                TEAM CHAT
              </h2>
              <div className="flex items-center gap-2">
                <button
                  className={`text-xs select-none transition-colors ${
                    favOnly ? "text-red-400" : "text-gray-500 hover:text-red-400"
                  }`}
                  onClick={toggleFavOnly}
                  title={favOnly ? "顯示全部" : "只看愛心"}
                  aria-pressed={favOnly}
                >
                  {favOnly ? "\u2764\uFE0F 只看愛心" : "\uD83E\uDD0D 只看愛心"}
                </button>
                {onMinimize && (
                  <button
                    className="text-gray-500 hover:text-cyan-400"
                    onClick={onMinimize}
                    title="最小化"
                    aria-label="最小化"
                  >
                    {/* Simple underscore icon = minimise */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="19" x2="19" y2="19" />
                    </svg>
                  </button>
                )}
                {onExpandFullscreen && (
                  <button
                    className="text-gray-500 hover:text-cyan-400"
                    onClick={onExpandFullscreen}
                    title="全螢幕"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <ChatChannelList
                summaries={summaries}
                onSelectChannel={openRoom}
                compact
                favOnly={favOnly}
              />
            </div>
            <div className="px-4 py-2 border-t border-gray-700">
              <button
                className="w-full py-1.5 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700"
                onClick={handleClose}
              >
                關閉
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
