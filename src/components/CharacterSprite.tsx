"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MemberData, CharacterPose } from "@/types";
import PixelCharacterSVG from "./PixelCharacterSVG";
import MemberCard from "./MemberCard";

// ============================================================
// Coordinate system (percentages of office container)
// ============================================================
export const ROOM_COORDS: Record<string, { x: number; y: number }> = {
  // Desk positions (character "home")
  boss:      { x: 18, y: 30 },
  secretary: { x: 50, y: 30 },
  sherlock:  { x: 15, y: 52 },
  lego:      { x: 38, y: 52 },
  vault:     { x: 61, y: 52 },
  forge:     { x: 26, y: 72 },
  lens:      { x: 52, y: 72 },
  waffles:   { x: 32, y: 33 },

  // Public areas
  tearoom:   { x: 82, y: 88 },
  meeting:   { x: 18, y: 88 },
};

// Desk positions match character home but are static furniture
export const DESK_COORDS: Record<string, { x: number; y: number }> = {
  boss:      { x: 18, y: 35 },
  secretary: { x: 50, y: 35 },
  sherlock:  { x: 15, y: 57 },
  lego:      { x: 38, y: 57 },
  vault:     { x: 61, y: 57 },
  forge:     { x: 26, y: 77 },
  lens:      { x: 52, y: 77 },
};

// ============================================================
// Movement destinations for idle characters
// ============================================================
type Destination = "home" | "tearoom" | "meeting" | "wander";

interface MovementTarget {
  dest: Destination;
  coords: { x: number; y: number };
  stayMs: number; // how long to stay at destination
  poseAtDest: CharacterPose;
}

function getIdleTargets(memberId: string): MovementTarget[] {
  const home = ROOM_COORDS[memberId];
  if (!home) return [];

  if (memberId === "waffles") {
    // Waffles wanders to random team members
    const targets = ["boss", "sherlock", "forge", "lens"];
    const pick = targets[Math.floor(Math.random() * targets.length)];
    const targetCoord = ROOM_COORDS[pick];
    return [
      { dest: "wander", coords: { x: targetCoord.x + 3, y: targetCoord.y }, stayMs: 4000, poseAtDest: "sitting" },
      { dest: "home", coords: home, stayMs: 10000, poseAtDest: "sleeping" },
    ];
  }

  // Regular idle members: go to tearoom or meeting room
  switch (memberId) {
    case "sherlock":
    case "lens":
      return [
        { dest: "tearoom", coords: ROOM_COORDS.tearoom, stayMs: 5000, poseAtDest: "drinking" },
        { dest: "home", coords: home, stayMs: 8000, poseAtDest: "sitting" },
      ];
    case "lego":
      return [
        { dest: "meeting", coords: ROOM_COORDS.meeting, stayMs: 6000, poseAtDest: "standing" },
        { dest: "home", coords: home, stayMs: 8000, poseAtDest: "sitting" },
      ];
    default:
      // Desk workers (boss, secretary, vault, forge) - occasionally stand up
      return [
        { dest: "tearoom", coords: ROOM_COORDS.tearoom, stayMs: 4000, poseAtDest: "drinking" },
        { dest: "home", coords: home, stayMs: 12000, poseAtDest: "sitting" },
      ];
  }
}

// ============================================================
// Status bubble - visual indicator above character
// ============================================================
function StatusBubble({ pose, isMoving }: { pose: CharacterPose; isMoving: boolean }) {
  if (isMoving) {
    return (
      <div className="text-center mb-0.5">
        <span className="text-[10px] animate-walk-step">👣</span>
      </div>
    );
  }

  switch (pose) {
    case "sitting":
      return (
        <div className="text-center mb-0.5">
          <span className="text-[10px] inline-block" style={{ animation: "typing-keys 0.8s steps(3) infinite" }}>⌨️</span>
        </div>
      );
    case "drinking":
      return (
        <div className="text-center mb-0.5">
          <span className="text-[10px]">☕</span>
        </div>
      );
    case "standing":
      return (
        <div className="text-center mb-0.5">
          <span className="text-[10px] inline-block" style={{ animation: "thinking-pulse 2s ease-in-out infinite" }}>💬</span>
        </div>
      );
    case "sleeping":
      return (
        <div className="text-center mb-0.5 flex gap-0.5 justify-center">
          <span className="text-[8px] animate-zzz inline-block">Z</span>
          <span className="text-[10px] animate-zzz inline-block" style={{ animationDelay: "0.5s" }}>Z</span>
          <span className="text-[12px] animate-zzz inline-block" style={{ animationDelay: "1s" }}>Z</span>
        </div>
      );
    case "walking":
      return (
        <div className="text-center mb-0.5">
          <span className="text-[10px]">👣</span>
        </div>
      );
    default:
      return null;
  }
}

// ============================================================
// CharacterSprite component
// ============================================================
interface CharacterSpriteProps {
  member: MemberData;
}

export default function CharacterSprite({ member }: CharacterSpriteProps) {
  const home = ROOM_COORDS[member.id] ?? { x: 50, y: 50 };
  const [pos, setPos] = useState(home);
  const [pose, setPose] = useState<CharacterPose>(
    member.status === "working" ? "sitting" :
    member.id === "waffles" ? "sleeping" : "sitting"
  );
  const [isMoving, setIsMoving] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [isWagging, setIsWagging] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRef = useRef(0);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Idle movement cycle
  const runIdleCycle = useCallback(() => {
    if (!mountedRef.current) return;

    const targets = getIdleTargets(member.id);
    if (targets.length === 0) return;

    const step = stepRef.current % targets.length;
    const target = targets[step];
    stepRef.current++;

    // Start walking
    setIsMoving(true);
    setPose("walking");
    setPos(target.coords);

    // Arrive after transition (3s)
    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setIsMoving(false);
      setPose(target.poseAtDest);

      // Stay at destination, then continue cycle
      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        runIdleCycle();
      }, target.stayMs);
    }, 3000);
  }, [member.id]);

  // Start/stop idle cycle based on status
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (member.status === "working") {
      setPos(home);
      setPose("sitting");
      setIsMoving(false);
      return;
    }

    if (member.status === "meeting") {
      // Everyone goes to meeting room, staggered positions around table
      const meetingBase = ROOM_COORDS.meeting;
      const offsets: Record<string, { dx: number; dy: number }> = {
        boss:      { dx: 0,  dy: -5 },
        secretary: { dx: 8,  dy: -5 },
        sherlock:  { dx: -8, dy: 0 },
        lego:      { dx: 8,  dy: 0 },
        vault:     { dx: -8, dy: -5 },
        forge:     { dx: 0,  dy: 0 },
        lens:      { dx: -4, dy: -3 },
        waffles:   { dx: 12, dy: 2 },
      };
      const offset = offsets[member.id] ?? { dx: 0, dy: 0 };
      setPos({ x: meetingBase.x + offset.dx, y: meetingBase.y + offset.dy });
      setPose(member.id === "waffles" ? "sitting" : "standing");
      setIsMoving(false);
      return;
    }

    if (member.status === "sleeping") {
      setPos(home);
      setPose("sleeping");
      setIsMoving(false);
      return;
    }

    // idle: start movement after random initial delay
    const initialDelay = 2000 + Math.random() * 6000;
    setPos(home);
    setPose(member.id === "waffles" ? "sleeping" : "sitting");
    setIsMoving(false);

    timerRef.current = setTimeout(() => {
      if (mountedRef.current) runIdleCycle();
    }, initialDelay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [member.status, member.id, home, runIdleCycle]);

  const handleClick = () => {
    if (member.id === "waffles") {
      setIsWagging(true);
      setTimeout(() => setIsWagging(false), 2000);
    }
    setShowCard(true);
  };

  // z-index: lower y = further back = lower z-index
  const zIndex = Math.round(pos.y);

  // Determine walking animation class
  const walkClass = isMoving ? (member.id === "waffles" ? "animate-dog-trot" : "animate-walk-step") : "";

  return (
    <>
      <div
        className="absolute flex flex-col items-center"
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: "translate(-50%, -100%)",
          transition: isMoving ? "left 3s ease-in-out, top 3s ease-in-out" : "none",
          zIndex: zIndex + 10,
        }}
      >
        {/* Status indicator above name */}
        <StatusBubble pose={isMoving ? "walking" : pose} isMoving={isMoving} />
        {/* Name label */}
        <p
          className="pixel-text text-[8px] sm:text-[10px] text-center mb-0.5 whitespace-nowrap"
          style={{ color: member.primaryColor }}
        >
          {member.nameCn}
        </p>
        {/* Character sprite */}
        <div className={walkClass}>
          <PixelCharacterSVG
            member={member}
            pose={isMoving ? "walking" : pose}
            onClick={handleClick}
            isWagging={isWagging}
          />
        </div>
      </div>

      {showCard && (
        <MemberCard member={member} onClose={() => setShowCard(false)} />
      )}
    </>
  );
}
