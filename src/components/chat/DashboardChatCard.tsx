"use client";

import type { ChatChannelSummary } from "@/types";
import { ChatChannelList } from "./ChatChannelList";

interface Props {
  summaries: ChatChannelSummary[];
  onSelectChannel: (channelId: string) => void;
  onExpandFullscreen?: () => void;
}

export function DashboardChatCard({ summaries, onSelectChannel, onExpandFullscreen }: Props) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-mono tracking-wider text-xs text-gray-500 uppercase">Chat</h3>
        {onExpandFullscreen && (
          <button
            className="text-gray-600 hover:text-cyan-400 text-xs font-mono"
            onClick={onExpandFullscreen}
            title="全螢幕"
          >
            [+]
          </button>
        )}
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        <ChatChannelList
          summaries={summaries}
          onSelectChannel={onSelectChannel}
          compact
        />
      </div>
    </div>
  );
}
