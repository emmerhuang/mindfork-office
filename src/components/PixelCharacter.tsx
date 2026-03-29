"use client";

import { MemberData, MemberStatus } from "@/types";

// 8x8 pixel art definitions using box-shadow technique
// Each pixel is defined as [row, col, color]
type Pixel = [number, number, string];

function generateBoxShadow(pixels: Pixel[], size: number): string {
  return pixels
    .map(([r, c, color]) => `${c * size}px ${r * size}px 0 0 ${color}`)
    .join(", ");
}

// Boss: CEO chair, commanding presence, gold accents
const bossPixels: Pixel[] = [
  // Crown/hair
  [0, 2, "#ffd700"], [0, 3, "#8b0000"], [0, 4, "#8b0000"], [0, 5, "#ffd700"],
  // Head
  [1, 2, "#f0c8a0"], [1, 3, "#f0c8a0"], [1, 4, "#f0c8a0"], [1, 5, "#f0c8a0"],
  // Face (confident eyes)
  [2, 2, "#333"], [2, 3, "#f0c8a0"], [2, 4, "#f0c8a0"], [2, 5, "#333"],
  [3, 3, "#c0392b"], [3, 4, "#c0392b"],
  // Suit (dark red + gold)
  [4, 2, "#8b0000"], [4, 3, "#ffd700"], [4, 4, "#ffd700"], [4, 5, "#8b0000"],
  [5, 1, "#8b0000"], [5, 2, "#8b0000"], [5, 3, "#8b0000"], [5, 4, "#8b0000"], [5, 5, "#8b0000"], [5, 6, "#8b0000"],
  // Coffee cup in hand
  [4, 7, "#8b7355"], [3, 7, "#fff"], [3, 6, "#8b7355"],
  // Legs
  [6, 2, "#4a0000"], [6, 3, "#4a0000"], [6, 4, "#4a0000"], [6, 5, "#4a0000"],
  [7, 2, "#2c2c2c"], [7, 5, "#2c2c2c"],
];

// Secretary General: suit, glasses, multi-screen
const secretaryPixels: Pixel[] = [
  // Hair (dark)
  [0, 2, "#1a1a2e"], [0, 3, "#1a1a2e"], [0, 4, "#1a1a2e"], [0, 5, "#1a1a2e"],
  // Head
  [1, 2, "#f0c8a0"], [1, 3, "#f0c8a0"], [1, 4, "#f0c8a0"], [1, 5, "#f0c8a0"],
  // Face with glasses
  [2, 2, "#333"], [2, 3, "#f0c8a0"], [2, 4, "#f0c8a0"], [2, 5, "#333"],
  // Mouth
  [3, 3, "#c0392b"], [3, 4, "#c0392b"],
  // Suit (dark blue + gold tie)
  [4, 2, "#1e3a5f"], [4, 3, "#d4a843"], [4, 4, "#d4a843"], [4, 5, "#1e3a5f"],
  [5, 1, "#1e3a5f"], [5, 2, "#1e3a5f"], [5, 3, "#1e3a5f"], [5, 4, "#1e3a5f"], [5, 5, "#1e3a5f"], [5, 6, "#1e3a5f"],
  // Legs
  [6, 2, "#2c3e50"], [6, 3, "#2c3e50"], [6, 4, "#2c3e50"], [6, 5, "#2c3e50"],
  [7, 2, "#1a1a2e"], [7, 3, "#1a1a2e"], [7, 4, "#1a1a2e"], [7, 5, "#1a1a2e"],
];

// Sherlock: deerstalker hat, magnifying glass
const sherlockPixels: Pixel[] = [
  // Hat
  [0, 1, "#8b6914"], [0, 2, "#8b6914"], [0, 3, "#8b6914"], [0, 4, "#8b6914"], [0, 5, "#8b6914"], [0, 6, "#8b6914"],
  [1, 2, "#a07828"], [1, 3, "#a07828"], [1, 4, "#a07828"], [1, 5, "#a07828"],
  // Face
  [2, 2, "#f0c8a0"], [2, 3, "#f0c8a0"], [2, 4, "#f0c8a0"], [2, 5, "#f0c8a0"],
  [3, 2, "#444"], [3, 3, "#f0c8a0"], [3, 4, "#f0c8a0"], [3, 5, "#444"],
  // Body (brown coat)
  [4, 2, "#6b4c1e"], [4, 3, "#6b4c1e"], [4, 4, "#6b4c1e"], [4, 5, "#6b4c1e"],
  [5, 1, "#6b4c1e"], [5, 2, "#8b6914"], [5, 3, "#6b4c1e"], [5, 4, "#6b4c1e"], [5, 5, "#8b6914"], [5, 6, "#6b4c1e"],
  // Magnifying glass in hand
  [4, 7, "#c0c0c0"], [3, 7, "#c0c0c0"], [2, 7, "#87ceeb"], [2, 6, "#c0c0c0"], [3, 6, "#c0c0c0"],
  // Legs
  [6, 2, "#5a3d0f"], [6, 3, "#5a3d0f"], [6, 4, "#5a3d0f"], [6, 5, "#5a3d0f"],
  [7, 2, "#3d2906"], [7, 5, "#3d2906"],
];

// Lego: engineer hat, orange
const legoPixels: Pixel[] = [
  // Hard hat
  [0, 2, "#e87d20"], [0, 3, "#e87d20"], [0, 4, "#e87d20"], [0, 5, "#e87d20"],
  [1, 1, "#e87d20"], [1, 2, "#f0a040"], [1, 3, "#f0a040"], [1, 4, "#f0a040"], [1, 5, "#f0a040"], [1, 6, "#e87d20"],
  // Face
  [2, 2, "#f0c8a0"], [2, 3, "#f0c8a0"], [2, 4, "#f0c8a0"], [2, 5, "#f0c8a0"],
  [3, 2, "#444"], [3, 3, "#f0c8a0"], [3, 4, "#f0c8a0"], [3, 5, "#444"],
  // Body (grey)
  [4, 2, "#808080"], [4, 3, "#808080"], [4, 4, "#808080"], [4, 5, "#808080"],
  [5, 1, "#808080"], [5, 2, "#e87d20"], [5, 3, "#808080"], [5, 4, "#808080"], [5, 5, "#e87d20"], [5, 6, "#808080"],
  // Legs
  [6, 2, "#606060"], [6, 3, "#606060"], [6, 4, "#606060"], [6, 5, "#606060"],
  [7, 2, "#404040"], [7, 5, "#404040"],
];

// Vault: goggles, green
const vaultPixels: Pixel[] = [
  // Hair
  [0, 2, "#1a3a2a"], [0, 3, "#1a3a2a"], [0, 4, "#1a3a2a"], [0, 5, "#1a3a2a"],
  // Head
  [1, 2, "#f0c8a0"], [1, 3, "#f0c8a0"], [1, 4, "#f0c8a0"], [1, 5, "#f0c8a0"],
  // Goggles
  [2, 1, "#c0c0c0"], [2, 2, "#87ceeb"], [2, 3, "#c0c0c0"], [2, 4, "#c0c0c0"], [2, 5, "#87ceeb"], [2, 6, "#c0c0c0"],
  [3, 3, "#f0c8a0"], [3, 4, "#f0c8a0"],
  // Body (dark green)
  [4, 2, "#2d5a3d"], [4, 3, "#2d5a3d"], [4, 4, "#2d5a3d"], [4, 5, "#2d5a3d"],
  [5, 1, "#2d5a3d"], [5, 2, "#2d5a3d"], [5, 3, "#c0c0c0"], [5, 4, "#c0c0c0"], [5, 5, "#2d5a3d"], [5, 6, "#2d5a3d"],
  // Key ring
  [5, 7, "#d4a843"], [6, 7, "#d4a843"],
  // Legs
  [6, 2, "#1a3a2a"], [6, 3, "#1a3a2a"], [6, 4, "#1a3a2a"], [6, 5, "#1a3a2a"],
  [7, 2, "#0f2018"], [7, 5, "#0f2018"],
];

// Forge: apron, hammer, red+black
const forgePixels: Pixel[] = [
  // Hair
  [0, 2, "#2c2c2c"], [0, 3, "#2c2c2c"], [0, 4, "#2c2c2c"], [0, 5, "#2c2c2c"],
  // Head
  [1, 2, "#f0c8a0"], [1, 3, "#f0c8a0"], [1, 4, "#f0c8a0"], [1, 5, "#f0c8a0"],
  [2, 2, "#444"], [2, 3, "#f0c8a0"], [2, 4, "#f0c8a0"], [2, 5, "#444"],
  [3, 3, "#f0c8a0"], [3, 4, "#f0c8a0"],
  // Apron (red over black)
  [4, 2, "#2c2c2c"], [4, 3, "#c0392b"], [4, 4, "#c0392b"], [4, 5, "#2c2c2c"],
  [5, 1, "#2c2c2c"], [5, 2, "#c0392b"], [5, 3, "#c0392b"], [5, 4, "#c0392b"], [5, 5, "#c0392b"], [5, 6, "#2c2c2c"],
  // Hammer in hand
  [3, 0, "#8b7355"], [2, 0, "#8b7355"], [1, 0, "#c0c0c0"], [0, 0, "#c0c0c0"], [0, 1, "#c0c0c0"],
  // Legs
  [6, 2, "#2c2c2c"], [6, 3, "#2c2c2c"], [6, 4, "#2c2c2c"], [6, 5, "#2c2c2c"],
  [7, 2, "#1a1a1a"], [7, 5, "#1a1a1a"],
];

// Lens: white coat, magnifier
const lensPixels: Pixel[] = [
  // Hair
  [0, 2, "#555"], [0, 3, "#555"], [0, 4, "#555"], [0, 5, "#555"],
  // Head
  [1, 2, "#f0c8a0"], [1, 3, "#f0c8a0"], [1, 4, "#f0c8a0"], [1, 5, "#f0c8a0"],
  [2, 2, "#85c1e9"], [2, 3, "#f0c8a0"], [2, 4, "#f0c8a0"], [2, 5, "#85c1e9"],
  [3, 3, "#f0c8a0"], [3, 4, "#f0c8a0"],
  // White coat
  [4, 2, "#ecf0f1"], [4, 3, "#ecf0f1"], [4, 4, "#ecf0f1"], [4, 5, "#ecf0f1"],
  [5, 1, "#ecf0f1"], [5, 2, "#ecf0f1"], [5, 3, "#ecf0f1"], [5, 4, "#ecf0f1"], [5, 5, "#ecf0f1"], [5, 6, "#ecf0f1"],
  // Magnifying glass
  [4, 7, "#85c1e9"], [3, 7, "#c0c0c0"], [3, 6, "#c0c0c0"],
  // Legs
  [6, 2, "#bdc3c7"], [6, 3, "#bdc3c7"], [6, 4, "#bdc3c7"], [6, 5, "#bdc3c7"],
  [7, 2, "#95a5a6"], [7, 5, "#95a5a6"],
];

// Waffles: corgi!
const wafflesPixels: Pixel[] = [
  // Ears
  [0, 1, "#e8a838"], [0, 2, "#e8a838"], [0, 5, "#e8a838"], [0, 6, "#e8a838"],
  // Head
  [1, 1, "#e8a838"], [1, 2, "#e8a838"], [1, 3, "#fff"], [1, 4, "#fff"], [1, 5, "#e8a838"], [1, 6, "#e8a838"],
  // Face (eyes + nose)
  [2, 1, "#e8a838"], [2, 2, "#333"], [2, 3, "#fff"], [2, 4, "#fff"], [2, 5, "#333"], [2, 6, "#e8a838"],
  [3, 2, "#e8a838"], [3, 3, "#fff"], [3, 4, "#333"], [3, 5, "#fff"],
  // Body
  [4, 1, "#e8a838"], [4, 2, "#e8a838"], [4, 3, "#e8a838"], [4, 4, "#e8a838"], [4, 5, "#e8a838"], [4, 6, "#e8a838"],
  [5, 1, "#e8a838"], [5, 2, "#fff"], [5, 3, "#fff"], [5, 4, "#fff"], [5, 5, "#fff"], [5, 6, "#e8a838"],
  // Legs (short corgi legs!)
  [6, 1, "#e8a838"], [6, 2, "#e8a838"], [6, 5, "#e8a838"], [6, 6, "#e8a838"],
  [7, 1, "#c08020"], [7, 2, "#c08020"], [7, 5, "#c08020"], [7, 6, "#c08020"],
  // Tail
  [3, 7, "#e8a838"], [2, 7, "#e8a838"],
];

const characterPixelMap: Record<string, Pixel[]> = {
  boss: bossPixels,
  secretary: secretaryPixels,
  sherlock: sherlockPixels,
  lego: legoPixels,
  vault: vaultPixels,
  forge: forgePixels,
  lens: lensPixels,
  waffles: wafflesPixels,
};

function getStatusAnimation(status: MemberStatus): string {
  switch (status) {
    case "idle": return "animate-idle";
    case "working": return "animate-working";
    case "meeting": return "animate-sway";
    case "sleeping": return "animate-idle";
    case "celebrating": return "animate-celebrate";
    default: return "animate-idle";
  }
}

function StatusIndicator({ status }: { status: MemberStatus }) {
  switch (status) {
    case "working":
      return (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-yellow-400 animate-gear text-sm">
          &#9881;
        </div>
      );
    case "meeting":
      return (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 animate-speech">
          <div className="bg-white text-gray-800 text-[8px] px-1.5 py-0.5 rounded pixel-text">
            ...
          </div>
        </div>
      );
    case "sleeping":
      return (
        <div className="absolute -top-6 right-0">
          <span className="text-blue-300 text-[10px] animate-zzz inline-block">Z</span>
          <span className="text-blue-300 text-xs animate-zzz inline-block" style={{ animationDelay: "0.5s" }}>Z</span>
          <span className="text-blue-300 text-sm animate-zzz inline-block" style={{ animationDelay: "1s" }}>Z</span>
        </div>
      );
    case "celebrating":
      return (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-yellow-300 text-sm">
          &#9733;
        </div>
      );
    default:
      return null;
  }
}

interface PixelCharacterProps {
  member: MemberData;
  pixelSize?: number;
  onClick?: () => void;
  isWagging?: boolean;
}

export default function PixelCharacter({
  member,
  pixelSize = 4,
  onClick,
  isWagging = false,
}: PixelCharacterProps) {
  const pixels = characterPixelMap[member.id] || secretaryPixels;
  const shadow = generateBoxShadow(pixels, pixelSize);
  const animClass = getStatusAnimation(member.status);
  const wrapperClass = member.id === "waffles" && isWagging ? "animate-wag" : animClass;

  return (
    <div
      className={`relative cursor-pointer group ${wrapperClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${member.nameCn} - ${member.name}`}
    >
      <StatusIndicator status={member.status} />
      <div
        style={{
          width: pixelSize,
          height: pixelSize,
          boxShadow: shadow,
          marginRight: pixelSize * 7,
          marginBottom: pixelSize * 7,
        }}
      />
      {/* Hover tooltip */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
        <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded pixel-text">
          {member.nameCn}
        </div>
      </div>
    </div>
  );
}
