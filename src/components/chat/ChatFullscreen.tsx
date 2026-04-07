"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatChannelSummary } from "@/types";
import { ChatChannelList } from "./ChatChannelList";
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
          className="ml-auto text-gray-400 hover:text-white text-lg leading-none px-2 py-1"
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
