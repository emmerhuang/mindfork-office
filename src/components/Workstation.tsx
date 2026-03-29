"use client";

import { useState, useMemo } from "react";
import { MemberData } from "@/types";
import PixelCharacterSVG from "./PixelCharacterSVG";
import Desk from "./Desk";
import MemberCard from "./MemberCard";

interface WorkstationProps {
  member: MemberData;
}

const wanderClasses = ["animate-idle", "animate-idle-2", "animate-idle-3"];
const wanderDelays = [0, 1.5, 3, 4.5, 2, 5.5, 1, 3.5];

function getWanderIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100;
  }
  return hash;
}

export default function Workstation({ member }: WorkstationProps) {
  const [showCard, setShowCard] = useState(false);
  const [isWagging, setIsWagging] = useState(false);

  const wanderStyle = useMemo(() => {
    const idx = getWanderIndex(member.id);
    return {
      className: wanderClasses[idx % wanderClasses.length],
      delay: wanderDelays[idx % wanderDelays.length],
    };
  }, [member.id]);

  const handleClick = () => {
    if (member.id === "waffles") {
      setIsWagging(true);
      setTimeout(() => setIsWagging(false), 2000);
    }
    setShowCard(true);
  };

  const isIdle = member.status === "idle";

  return (
    <>
      <div className="flex flex-col items-center gap-0.5">
        {/* Name + Character wrapper: only this part wanders, desk stays put */}
        <div
          className={isIdle ? wanderStyle.className : ""}
          style={isIdle ? { animationDelay: `${wanderStyle.delay}s` } : undefined}
        >
          {/* Name above head */}
          <p
            className="pixel-text text-[10px] sm:text-sm text-center mb-0.5"
            style={{ color: member.primaryColor }}
          >
            {member.nameCn}
          </p>
          {/* Character - add walking bounce when idle */}
          <div className={isIdle ? (member.id === "waffles" ? "animate-dog-trot" : "animate-walk-step") : ""}>
            <PixelCharacterSVG
              member={member}
              onClick={handleClick}
              isWagging={isWagging}
            />
          </div>
        </div>
        {/* Desk (or dog bed for Waffles) stays fixed */}
        {member.id === "waffles" ? (
          <div className="w-14 sm:w-16 flex flex-col items-center">
            {/* Dog bed */}
            <div className="w-12 h-5 bg-amber-700 rounded-full border border-amber-800 relative">
              <div className="absolute inset-1 bg-amber-200 rounded-full" />
            </div>
            {/* Bowl + bone */}
            <div className="flex gap-1.5 mt-0.5">
              <div className="w-3 h-1.5 bg-red-500 rounded-b-full" />
              <div className="w-3 h-1 bg-white rounded-full" />
            </div>
          </div>
        ) : (
          <div className="w-14 sm:w-16">
            <Desk member={member} />
          </div>
        )}
      </div>

      {showCard && (
        <MemberCard member={member} onClose={() => setShowCard(false)} />
      )}
    </>
  );
}
