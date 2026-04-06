"use client";

import type { ChatChannelSummary } from "@/types";
import { ChatRoom } from "./ChatRoom";

interface Props {
  channel: ChatChannelSummary;
  onClose: () => void;
}

export function ChatRoomModal({ channel, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-30"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-cyan-500/60 rounded-lg w-full max-w-md mx-4 h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ imageRendering: "auto" }}
      >
        <ChatRoom
          channelId={channel.channel_id}
          participantA={channel.participant_a}
          participantB={channel.participant_b}
          messages={channel.messages}
          onBack={onClose}
        />
      </div>
    </div>
  );
}
