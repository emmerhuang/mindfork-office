"use client";

import { useState, useEffect, useCallback } from "react";
import type { ChatChannelSummary } from "@/types";
import { ChatChannelList } from "./ChatChannelList";
import { ChatRoom, type MemberProfile } from "./ChatRoom";

interface Props {
  summaries: ChatChannelSummary[];
  memberProfiles?: MemberProfile[];
  onClose: () => void;
}

export function ChatOverlay({ summaries, memberProfiles = [], onClose }: Props) {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const selectedChannel = summaries.find((c) => c.channel_id === selectedChannelId);

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

  return (
    <div
      className="absolute inset-0 bg-black/60 flex items-center justify-center z-10"
      onClick={handleClose}
    >
      <div
        className="bg-gray-900 border border-cyan-500 rounded-lg p-0 max-w-md w-full mx-4 max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ imageRendering: "auto" }}
      >
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
            <div className="px-4 pt-4 pb-2 border-b border-gray-700">
              <h2 className="text-sm font-bold text-cyan-400 font-mono tracking-wider">
                TEAM CHAT
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <ChatChannelList
                summaries={summaries}
                onSelectChannel={openRoom}
                compact
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
