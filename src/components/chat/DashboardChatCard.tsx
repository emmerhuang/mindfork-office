"use client";

import { useEffect, useState, useCallback } from "react";
import type { ChatChannelSummary } from "@/types";
import { ChatChannelList, getFavOnly, setFavOnly } from "./ChatChannelList";

interface Props {
  summaries: ChatChannelSummary[];
  onSelectChannel: (channelId: string) => void;
  onExpandFullscreen?: () => void;
}

export function DashboardChatCard({ summaries, onSelectChannel, onExpandFullscreen }: Props) {
  // Initialize false for SSR consistency; read localStorage after mount.
  const [favOnly, setFavOnlyState] = useState(false);

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

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-mono tracking-wider text-xs text-gray-500 uppercase">Chat</h3>
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
          {onExpandFullscreen && (
            <button
              className="text-gray-600 hover:text-cyan-400"
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
      <div className="max-h-[300px] overflow-y-auto">
        <ChatChannelList
          summaries={summaries}
          onSelectChannel={onSelectChannel}
          compact
          favOnly={favOnly}
        />
      </div>
    </div>
  );
}
