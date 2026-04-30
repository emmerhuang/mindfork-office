"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatChannelSummary } from "@/types";
import { ChatChannelList, getFavOnly, setFavOnly, markAllChannelsRead } from "./ChatChannelList";
import { ChatRoom, type MemberProfile } from "./ChatRoom";

export interface ChatFullscreenProps {
  summaries: ChatChannelSummary[];
  memberProfiles?: MemberProfile[];
  /** Pre-selected channel (carried from small window or channel click) */
  initialChannelId?: string | null;
  onClose: () => void;
}

const LG_BREAKPOINT = 1024;

export function ChatFullscreen({
  summaries,
  memberProfiles = [],
  initialChannelId,
  onClose,
}: ChatFullscreenProps) {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    initialChannelId ?? null
  );
  const [mobileView, setMobileView] = useState<"list" | "room">(
    initialChannelId ? "room" : "list"
  );
  const [favOnly, setFavOnlyState] = useState(false);
  // Bump to force ChatChannelList re-render after mark-all-read.
  const [, setReadAllRev] = useState(0);

  useEffect(() => {
    setFavOnlyState(getFavOnly());
  }, []);

  const handleMarkAllRead = useCallback(() => {
    markAllChannelsRead(summaries.map((s) => s.channel_id));
    setReadAllRev((r) => r + 1);
  }, [summaries]);

  const toggleFavOnly = useCallback(() => {
    setFavOnlyState((prev) => {
      const next = !prev;
      setFavOnly(next);
      return next;
    });
  }, []);

  // Refs to track latest values for popstate handler (avoids stale closures)
  const selectedChannelIdRef = useRef(selectedChannelId);
  const mobileViewRef = useRef(mobileView);
  const onCloseRef = useRef(onClose);
  selectedChannelIdRef.current = selectedChannelId;
  mobileViewRef.current = mobileView;
  onCloseRef.current = onClose;

  const selectedChannel = summaries.find(
    (c) => c.channel_id === selectedChannelId
  );

  // --- History management (mount-only) ---
  useEffect(() => {
    window.history.pushState({ chatFullscreen: true }, "");

    const onPopState = () => {
      if (selectedChannelIdRef.current && mobileViewRef.current === "room") {
        // Mobile in room -> back to list
        setMobileView("list");
        setSelectedChannelId(null);
        window.history.pushState({ chatFullscreen: true }, "");
      } else {
        // Close fullscreen
        onCloseRef.current();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (window.history.state?.chatFullscreen) {
          window.history.back();
        } else {
          onCloseRef.current();
        }
      }
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const handleSelectChannel = useCallback((channelId: string) => {
    setSelectedChannelId(channelId);
    setMobileView("room");
  }, []);

  const handleBack = useCallback(() => {
    if (window.innerWidth < LG_BREAKPOINT) {
      // Mobile: back to list
      setMobileView("list");
      setSelectedChannelId(null);
    } else {
      // Desktop: deselect
      setSelectedChannelId(null);
    }
  }, []);

  // Determine visibility classes for left/right panels
  const showListOnMobile = mobileView === "list";
  const showRoomOnMobile = mobileView === "room";

  return (
    <div className="fixed inset-0 z-40 bg-gray-950 flex flex-col">
      {/* Header bar */}
      <div className="flex items-center px-4 py-2 border-b border-gray-800 shrink-0">
        <h2 className="text-sm font-bold text-cyan-400 font-mono tracking-wider">
          TEAM CHAT
        </h2>
        <button
          className="ml-auto text-gray-500 hover:text-cyan-400 transition-colors"
          onClick={handleMarkAllRead}
          title="全部標為已讀"
          aria-label="全部標為已讀"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 11 8 16 13 11" />
            <polyline points="11 11 16 16 21 11" />
          </svg>
        </button>
        <button
          className={`ml-2 text-xs select-none transition-colors ${
            favOnly ? "text-red-400" : "text-gray-500 hover:text-red-400"
          }`}
          onClick={toggleFavOnly}
          title={favOnly ? "顯示全部" : "只看愛心"}
          aria-pressed={favOnly}
        >
          {favOnly ? "\u2764\uFE0F 只看愛心" : "\uD83E\uDD0D 只看愛心"}
        </button>
        <button
          className="ml-2 text-gray-400 hover:text-white text-lg leading-none px-2 py-1"
          onClick={() => {
            if (window.history.state?.chatFullscreen) {
              window.history.back();
            } else {
              onClose();
            }
          }}
          title="關閉"
        >
          X
        </button>
      </div>

      {/* Body: desktop split / mobile toggle */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel: channel list */}
        <div
          className={`border-r border-gray-800 flex flex-col ${
            showListOnMobile
              ? "flex w-full lg:w-[30%] lg:min-w-[280px] lg:max-w-[360px]"
              : "hidden lg:flex lg:w-[30%] lg:min-w-[280px] lg:max-w-[360px]"
          }`}
        >
          <div className="flex-1 overflow-y-auto p-2">
            <ChatChannelList
              summaries={summaries}
              onSelectChannel={handleSelectChannel}
              favOnly={favOnly}
            />
          </div>
        </div>

        {/* Right panel: chat room */}
        <div
          className={`flex-1 flex flex-col min-w-0 ${
            showRoomOnMobile ? "flex" : "hidden lg:flex"
          }`}
        >
          {selectedChannel ? (
            <ChatRoom
              channelId={selectedChannel.channel_id}
              participantA={selectedChannel.participant_a}
              participantB={selectedChannel.participant_b}
              messages={selectedChannel.messages}
              totalCount={selectedChannel.message_count}
              memberProfiles={memberProfiles}
              onBack={handleBack}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-600 text-sm font-mono">
                Select a channel
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
