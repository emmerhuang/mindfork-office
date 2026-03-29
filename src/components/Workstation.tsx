"use client";

import { useState, useMemo } from "react";
import { MemberData, CharacterPose } from "@/types";
import PixelCharacterSVG from "./PixelCharacterSVG";
import Desk from "./Desk";
import MemberCard from "./MemberCard";

interface WorkstationProps {
  member: MemberData;
}

// Each idle member gets a purposeful behavior
type IdleBehavior = "desk" | "tearoom" | "meeting" | "dog-rest";

const memberBehaviors: Record<string, IdleBehavior> = {
  boss: "desk",        // Boss stays at desk, drinks coffee
  secretary: "desk",   // Secretary works at desk
  sherlock: "tearoom",  // Sherlock goes to get coffee, thinks
  lego: "meeting",      // Lego goes to meeting room, plans on whiteboard
  vault: "desk",        // Vault stays at desk, guarding data
  forge: "desk",        // Forge stays at desk, coding
  lens: "tearoom",      // Lens goes to tea room for a break
  waffles: "dog-rest",  // Waffles rests on bed
};

const behaviorClasses: Record<IdleBehavior, string> = {
  desk: "animate-idle-desk",
  tearoom: "animate-idle-tearoom",
  meeting: "animate-idle-meeting",
  "dog-rest": "animate-idle-dog-rest",
};

const behaviorDelays: Record<string, number> = {
  sherlock: 3,
  lego: 8,
  lens: 12,
};

/**
 * Determine the character pose based on status and idle behavior.
 *
 * - working status -> sitting (at desk, coding/working)
 * - idle + desk behavior -> sitting (at desk, occasionally sipping)
 * - idle + tearoom -> walking while moving, drinking when arrived
 *   (We approximate this with the CSS animation phases: the character
 *    walks out and back. During the "pause" phase they'd be drinking,
 *    but since we can't detect CSS animation phase in JS, we use
 *    walking as the default pose for tearoom/meeting walkers.)
 * - idle + meeting -> walking while moving, standing when arrived
 * - idle + dog-rest -> sleeping (Waffles)
 */
function getPoseForMember(member: MemberData): CharacterPose {
  const behavior = memberBehaviors[member.id] ?? "desk";

  if (member.status === "working") {
    return "sitting";
  }

  if (member.status === "idle") {
    switch (behavior) {
      case "desk":
        return "sitting";
      case "tearoom":
        // Walkers alternate between walking and drinking via CSS animation.
        // We show "walking" pose; the CSS idle-to-tearoom handles the movement.
        return "walking";
      case "meeting":
        return "walking";
      case "dog-rest":
        return member.id === "waffles" ? "sleeping" : "standing";
      default:
        return "standing";
    }
  }

  // meeting, sleeping, celebrating statuses: use standing
  return "standing";
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

  const isIdle = member.status === "idle";
  const behavior = memberBehaviors[member.id] ?? "desk";
  const isWalking = isIdle && (behavior === "tearoom" || behavior === "meeting");
  const pose = useMemo(() => getPoseForMember(member), [member]);

  return (
    <>
      <div className="flex flex-col items-center gap-0.5">
        {/* Name + Character: this part moves for walkers */}
        <div
          className={isIdle ? behaviorClasses[behavior] : ""}
          style={behaviorDelays[member.id] ? { animationDelay: `${behaviorDelays[member.id]}s` } : undefined}
        >
          <p
            className="pixel-text text-[10px] sm:text-sm text-center mb-0.5"
            style={{ color: member.primaryColor }}
          >
            {member.nameCn}
          </p>
          <div className={isWalking ? "animate-walk-step" : ""}>
            <PixelCharacterSVG
              member={member}
              pose={pose}
              onClick={handleClick}
              isWagging={isWagging}
            />
          </div>
        </div>
        {/* Desk or dog bed stays fixed */}
        {member.id === "waffles" ? (
          <div className="w-14 sm:w-16 flex flex-col items-center">
            <div className="w-12 h-5 bg-amber-700 rounded-full border border-amber-800 relative">
              <div className="absolute inset-1 bg-amber-200 rounded-full" />
            </div>
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
