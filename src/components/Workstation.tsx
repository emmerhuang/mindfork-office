"use client";

import { useState } from "react";
import { MemberData } from "@/types";
import PixelCharacter from "./PixelCharacter";
import Desk from "./Desk";
import MemberCard from "./MemberCard";

interface WorkstationProps {
  member: MemberData;
}

export default function Workstation({ member }: WorkstationProps) {
  const [showCard, setShowCard] = useState(false);
  const [isWagging, setIsWagging] = useState(false);

  const handleClick = () => {
    if (member.id === "waffles") {
      setIsWagging(true);
      setTimeout(() => setIsWagging(false), 2000);
    }
    setShowCard(true);
  };

  return (
    <>
      <div className="flex flex-col items-center gap-0.5">
        {/* Name above head */}
        <p
          className="pixel-text text-sm text-center mb-0.5"
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
        <div className="w-16">
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
