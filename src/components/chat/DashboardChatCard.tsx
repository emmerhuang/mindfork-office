"use client";

import type { ChatChannelSummary } from "@/types";
import { ChatChannelList } from "./ChatChannelList";

interface Props {
  summaries: ChatChannelSummary[];
  onSelectChannel: (channelId: string) => void;
}

export function DashboardChatCard({ summaries, onSelectChannel }: Props) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-3">
      <h3 className="font-mono tracking-wider text-xs text-gray-500 uppercase mb-2">Chat</h3>
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
