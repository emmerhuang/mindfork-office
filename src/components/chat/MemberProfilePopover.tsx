"use client";

import { useEffect, useRef } from "react";
import type { MemberProfile } from "./ChatRoom";

interface Props {
  memberId: string;
  memberProfiles: MemberProfile[];
  onClose: () => void;
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

export function MemberProfilePopover({ memberId, memberProfiles, onClose }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fallback profile for members not in the list
  const profile = memberProfiles.find(p => p.id === memberId) || {
    id: memberId,
    name: MEMBER_NAMES[memberId] || memberId,
    nameCn: MEMBER_NAMES[memberId] || memberId,
    role: "--",
    primaryColor: "#666",
  };

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-12 left-8 bg-gray-800 border border-gray-600 rounded-lg p-4 shadow-lg z-50 w-56"
      style={{ minWidth: "220px" }}
    >
      {/* Avatar */}
      <div className="flex justify-center mb-3">
        <div
          className="w-16 h-16 rounded-full overflow-hidden border-2"
          style={{
            borderColor: profile.primaryColor,
            imageRendering: "pixelated" as const,
          }}
        >
          <div style={{
            width: 64, height: 64,
            backgroundImage: `url(/sprites/atlas/${profile.id}.png)`,
            backgroundSize: "auto 64px",
            backgroundPosition: "0px 0px",
            backgroundRepeat: "no-repeat",
          }} />
        </div>
      </div>

      {/* Name and Role */}
      <h3 className="text-center text-lg font-bold mb-1" style={{ color: profile.primaryColor }}>
        {profile.nameCn}
      </h3>
      <p className="text-center text-sm text-gray-400 mb-4 h-10 flex items-center justify-center">
        {profile.role}
      </p>

      {/* Self Introduction or Description */}
      <div className="mb-4 px-2">
        <p className="text-sm text-gray-300 text-center leading-relaxed">
          {profile.selfIntro || profile.description}
        </p>
      </div>

      {/* Close hint */}
      <div className="text-center">
        <p className="text-xs text-gray-600">點擊外部關閉</p>
      </div>
    </div>
  );
}
