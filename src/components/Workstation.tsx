"use client";

import { useState, useMemo } from "react";
import { MemberData } from "@/types";
import PixelCharacter from "./PixelCharacter";
import Desk from "./Desk";
import MemberCard from "./MemberCard";

interface WorkstationProps {
  member: MemberData;
}

// Assign each idle member a different wander animation and delay
const wanderClasses = ["animate-idle", "animate-idle-2", "animate-idle-3"];
const wanderDelays = [0, 1.5, 3, 4.5, 2, 5.5, 1, 3.5]; // stagger per member

function getWanderIndex(id: string): number {
  // Simple hash to get consistent animation variant per member
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
      <div
        className={`flex flex-col items-center gap-0.5 ${isIdle ? wanderStyle.className : ""}`}
        style={isIdle ? { animationDelay: `${wanderStyle.delay}s` } : undefined}
      >
        {/* Name above head */}
        <p
          className="pixel-text text-[10px] sm:text-sm text-center mb-0.5"
          style={{ color: member.primaryColor }}
        >
          {member.nameCn}
        </p>
        {/* Character */}
        <PixelCharacter
          member={member}
          pixelSize={4}
          onClick={handleClick}
          isWagging={isWagging}
        />
        {/* Desk */}
        <div className="w-14 sm:w-16">
          <Desk member={member} />
        </div>
      </div>

      {/* Detail card modal (portal to body) */}
      {showCard && (
        <MemberCard member={member} onClose={() => setShowCard(false)} />
      )}
    </>
  );
}
