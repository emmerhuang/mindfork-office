"use client";

import { MemberData, MemberStatus, CharacterPose } from "@/types";

// ============================================================
// Pixel grid helpers — build 64x64 characters without listing 4096 pixels
// ============================================================
type PixelGrid = Map<string, string>; // key = "x,y" → color

function createGrid(): PixelGrid {
  return new Map();
}

function cloneGrid(source: PixelGrid): PixelGrid {
  return new Map(source);
}

function fillRect(
  grid: PixelGrid,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      grid.set(`${x + dx},${y + dy}`, color);
    }
  }
}

function clearRect(
  grid: PixelGrid,
  x: number,
  y: number,
  w: number,
  h: number
) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      grid.delete(`${x + dx},${y + dy}`);
    }
  }
}

function fillCircle(
  grid: PixelGrid,
  cx: number,
  cy: number,
  r: number,
  color: string
) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        grid.set(`${cx + dx},${cy + dy}`, color);
      }
    }
  }
}

function setPixel(grid: PixelGrid, x: number, y: number, color: string) {
  grid.set(`${x},${y}`, color);
}

function fillEllipse(
  grid: PixelGrid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string
) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
        grid.set(`${cx + dx},${cy + dy}`, color);
      }
    }
  }
}

function hLine(
  grid: PixelGrid,
  x: number,
  y: number,
  len: number,
  color: string
) {
  fillRect(grid, x, y, len, 1, color);
}

function vLine(
  grid: PixelGrid,
  x: number,
  y: number,
  len: number,
  color: string
) {
  fillRect(grid, x, y, 1, len, color);
}

// Convert grid to array of rects grouped by color (optimization)
function gridToRects(grid: PixelGrid): { x: number; y: number; color: string }[] {
  const result: { x: number; y: number; color: string }[] = [];
  grid.forEach((color, key) => {
    const [x, y] = key.split(",").map(Number);
    result.push({ x, y, color });
  });
  return result;
}

// Group adjacent same-color pixels into wider rects for SVG optimization
function optimizeRects(
  pixels: { x: number; y: number; color: string }[]
): { x: number; y: number; w: number; h: number; color: string }[] {
  const byColorAndY = new Map<string, { x: number; y: number }[]>();
  for (const p of pixels) {
    const key = `${p.color}|${p.y}`;
    if (!byColorAndY.has(key)) byColorAndY.set(key, []);
    byColorAndY.get(key)!.push(p);
  }

  const result: { x: number; y: number; w: number; h: number; color: string }[] = [];
  byColorAndY.forEach((points, key) => {
    const color = key.split("|")[0];
    const sorted = points.sort((a, b) => a.x - b.x);
    let i = 0;
    while (i < sorted.length) {
      const start = sorted[i];
      let w = 1;
      while (i + w < sorted.length && sorted[i + w].x === start.x + w) {
        w++;
      }
      result.push({ x: start.x, y: start.y, w, h: 1, color });
      i += w;
    }
  });
  return result;
}

// ============================================================
// Color palettes
// ============================================================
const SKIN = "#f0c8a0";
const SKIN_SHADOW = "#e0b090";
const HAIR_BLACK = "#2a2a2a";
const HAIR_BROWN = "#6b3a1f";
const EYE_BLACK = "#1a1a1a";
const SHOE_BLACK = "#2c2c2c";
const WHITE = "#ffffff";
const STEAM = "#ccddee";
const CUP_BODY = "#8b7355";
const CUP_FILL = "#5c3d1e";

// ============================================================
// Pose overlay types
// ============================================================
// Each character builder returns a base grid.
// Pose modifiers mutate a cloned grid for the target pose.

type PoseModifier = (base: PixelGrid) => PixelGrid;
type WalkFrameModifier = (base: PixelGrid) => [PixelGrid, PixelGrid]; // frameA, frameB

// ============================================================
// Generic humanoid pose helpers
// ============================================================
// Most humanoid characters share the same leg/arm structure.
// These helpers apply pose changes to a cloned base grid.

interface HumanoidLayout {
  // Legs region (to clear when modifying)
  leftLegX: number;
  rightLegX: number;
  legY: number;
  legW: number;
  legH: number;
  legColor: string;
  // Shoes
  leftShoeX: number;
  rightShoeX: number;
  shoeY: number;
  shoeW: number;
  shoeH: number;
  shoeColor: string;
  // Arms (for drinking pose)
  rightArmX: number;
  armY: number;
  armW: number;
  armH: number;
  armColor: string;
  rightHandX: number;
  handY: number;
  handW: number;
  handH: number;
  // Mouth Y (for drinking — cup near mouth)
  mouthY: number;
  // Belt
  beltY: number;
}

function applySitting(base: PixelGrid, layout: HumanoidLayout): PixelGrid {
  const g = cloneGrid(base);
  // Clear original legs and shoes
  clearRect(g, layout.leftLegX, layout.legY, layout.legW, layout.legH);
  clearRect(g, layout.rightLegX, layout.legY, layout.legW, layout.legH);
  clearRect(g, layout.leftShoeX, layout.shoeY, layout.shoeW, layout.shoeH);
  clearRect(g, layout.rightShoeX, layout.shoeY, layout.shoeW, layout.shoeH);
  // Draw shorter bent legs (half height, offset down)
  const sitLegH = Math.floor(layout.legH * 0.5);
  const sitY = layout.legY + (layout.legH - sitLegH);
  fillRect(g, layout.leftLegX, sitY, layout.legW, sitLegH, layout.legColor);
  fillRect(g, layout.rightLegX, sitY, layout.legW, sitLegH, layout.legColor);
  // Feet extend forward (horizontal)
  const feetY = sitY + sitLegH;
  fillRect(g, layout.leftLegX - 2, feetY, layout.legW + 2, 2, layout.shoeColor);
  fillRect(g, layout.rightLegX - 2, feetY, layout.legW + 2, 2, layout.shoeColor);
  return g;
}

function applyWalking(base: PixelGrid, layout: HumanoidLayout): [PixelGrid, PixelGrid] {
  // Frame A: left leg forward, right leg back
  const a = cloneGrid(base);
  clearRect(a, layout.leftLegX, layout.legY, layout.legW, layout.legH);
  clearRect(a, layout.rightLegX, layout.legY, layout.legW, layout.legH);
  clearRect(a, layout.leftShoeX, layout.shoeY, layout.shoeW, layout.shoeH);
  clearRect(a, layout.rightShoeX, layout.shoeY, layout.shoeW, layout.shoeH);
  // Left leg forward (shifted left 2px)
  fillRect(a, layout.leftLegX - 2, layout.legY, layout.legW, layout.legH, layout.legColor);
  fillRect(a, layout.leftShoeX - 2, layout.shoeY, layout.shoeW, layout.shoeH, layout.shoeColor);
  // Right leg back (shifted right 2px)
  fillRect(a, layout.rightLegX + 2, layout.legY, layout.legW, layout.legH, layout.legColor);
  fillRect(a, layout.rightShoeX + 2, layout.shoeY, layout.shoeW, layout.shoeH, layout.shoeColor);

  // Frame B: right leg forward, left leg back (opposite)
  const b = cloneGrid(base);
  clearRect(b, layout.leftLegX, layout.legY, layout.legW, layout.legH);
  clearRect(b, layout.rightLegX, layout.legY, layout.legW, layout.legH);
  clearRect(b, layout.leftShoeX, layout.shoeY, layout.shoeW, layout.shoeH);
  clearRect(b, layout.rightShoeX, layout.shoeY, layout.shoeW, layout.shoeH);
  // Left leg back (shifted right 2px)
  fillRect(b, layout.leftLegX + 2, layout.legY, layout.legW, layout.legH, layout.legColor);
  fillRect(b, layout.leftShoeX + 2, layout.shoeY, layout.shoeW, layout.shoeH, layout.shoeColor);
  // Right leg forward (shifted left 2px)
  fillRect(b, layout.rightLegX - 2, layout.legY, layout.legW, layout.legH, layout.legColor);
  fillRect(b, layout.rightShoeX - 2, layout.shoeY, layout.shoeW, layout.shoeH, layout.shoeColor);

  return [a, b];
}

function applyDrinking(base: PixelGrid, layout: HumanoidLayout): PixelGrid {
  const g = cloneGrid(base);
  // Clear right arm and hand
  clearRect(g, layout.rightArmX, layout.armY, layout.armW, layout.armH);
  clearRect(g, layout.rightHandX, layout.handY, layout.handW, layout.handH);
  // Clear any item that was in right hand area (generous clear)
  clearRect(g, layout.rightArmX, layout.armY - 6, layout.armW + 8, layout.armH + 12);
  // Redraw right arm raised (bent upward toward mouth)
  const cupX = 38;
  const cupY = layout.mouthY - 1;
  // Upper arm (shoulder to elbow)
  fillRect(g, layout.rightArmX, layout.armY, layout.armW, 8, layout.armColor);
  // Forearm angled up
  fillRect(g, layout.rightArmX - 2, layout.armY + 2, layout.armW, 6, layout.armColor);
  // Hand near mouth
  fillRect(g, cupX - 2, cupY, 3, 3, SKIN);
  // Coffee cup
  fillRect(g, cupX, cupY - 1, 5, 6, CUP_BODY);
  fillRect(g, cupX + 1, cupY, 3, 4, CUP_FILL);
  // Steam
  setPixel(g, cupX + 1, cupY - 2, STEAM);
  setPixel(g, cupX + 3, cupY - 3, STEAM);
  return g;
}

// ============================================================
// Character builders — base (standing) pose
// ============================================================

function buildBoss(): PixelGrid {
  const g = createGrid();

  // --- Hair (rows 2-5) ---
  fillRect(g, 22, 2, 20, 4, HAIR_BLACK);
  fillRect(g, 20, 4, 24, 2, HAIR_BLACK);

  // --- Head (rows 6-18) ---
  fillEllipse(g, 32, 13, 11, 8, SKIN);

  // --- Eyes (row 11-12) ---
  fillRect(g, 26, 11, 3, 2, EYE_BLACK);
  fillRect(g, 35, 11, 3, 2, EYE_BLACK);
  fillRect(g, 25, 9, 5, 1, HAIR_BLACK);
  fillRect(g, 34, 9, 5, 1, HAIR_BLACK);

  // --- Nose ---
  fillRect(g, 31, 13, 2, 2, SKIN_SHADOW);

  // --- Mouth ---
  fillRect(g, 28, 16, 8, 1, "#c0392b");
  fillRect(g, 29, 17, 6, 1, "#a83226");

  // --- Neck ---
  fillRect(g, 29, 20, 6, 3, SKIN);

  // --- Suit body (dark red) ---
  const SUIT = "#8b0000";
  const SUIT_DARK = "#6b0000";
  fillRect(g, 18, 23, 28, 4, SUIT);
  fillRect(g, 20, 27, 24, 14, SUIT);
  fillRect(g, 20, 23, 4, 10, SUIT_DARK);
  fillRect(g, 40, 23, 4, 10, SUIT_DARK);

  // --- Gold tie ---
  const TIE = "#ffd700";
  fillRect(g, 31, 23, 2, 2, TIE);
  fillRect(g, 30, 25, 4, 2, TIE);
  fillRect(g, 31, 27, 2, 10, TIE);
  setPixel(g, 30, 37, TIE);
  setPixel(g, 33, 37, TIE);

  // --- Arms ---
  fillRect(g, 14, 24, 4, 14, SUIT);
  fillRect(g, 46, 24, 4, 14, SUIT);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  // --- Coffee cup in right hand ---
  fillRect(g, 47, 34, 6, 7, CUP_BODY);
  fillRect(g, 48, 35, 4, 5, CUP_FILL);
  fillRect(g, 49, 33, 2, 2, STEAM);
  fillRect(g, 50, 31, 2, 2, STEAM);

  // --- Belt ---
  fillRect(g, 20, 41, 24, 2, SUIT_DARK);
  fillRect(g, 30, 41, 4, 2, "#d4a843");

  // --- Legs ---
  const PANTS = "#4a0000";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  // --- Shoes ---
  fillRect(g, 20, 55, 12, 3, SHOE_BLACK);
  fillRect(g, 32, 55, 12, 3, SHOE_BLACK);

  return g;
}

const BOSS_LAYOUT: HumanoidLayout = {
  leftLegX: 22, rightLegX: 34, legY: 43, legW: 8, legH: 12, legColor: "#4a0000",
  leftShoeX: 20, rightShoeX: 32, shoeY: 55, shoeW: 12, shoeH: 3, shoeColor: SHOE_BLACK,
  rightArmX: 46, armY: 24, armW: 4, armH: 14, armColor: "#8b0000",
  rightHandX: 46, handY: 38, handW: 4, handH: 3,
  mouthY: 16, beltY: 41,
};

function buildSecretary(): PixelGrid {
  const g = createGrid();

  fillRect(g, 22, 2, 20, 5, HAIR_BLACK);
  fillRect(g, 20, 4, 24, 3, HAIR_BLACK);

  fillEllipse(g, 32, 13, 11, 8, SKIN);

  const GLASS = "#a0a8b4";
  fillRect(g, 24, 10, 6, 4, GLASS);
  fillRect(g, 25, 11, 4, 2, "#d0e8ff");
  fillRect(g, 34, 10, 6, 4, GLASS);
  fillRect(g, 35, 11, 4, 2, "#d0e8ff");
  fillRect(g, 30, 11, 4, 1, GLASS);

  fillRect(g, 26, 11, 2, 2, EYE_BLACK);
  fillRect(g, 36, 11, 2, 2, EYE_BLACK);
  fillRect(g, 25, 9, 5, 1, HAIR_BLACK);
  fillRect(g, 34, 9, 5, 1, HAIR_BLACK);

  fillRect(g, 31, 14, 2, 2, SKIN_SHADOW);
  fillRect(g, 29, 17, 6, 1, "#cc8866");
  fillRect(g, 29, 20, 6, 3, SKIN);

  const SUIT = "#1a3a6a";
  const SUIT_DARK = "#0d2240";
  fillRect(g, 18, 23, 28, 4, SUIT);
  fillRect(g, 20, 27, 24, 14, SUIT);
  fillRect(g, 20, 23, 4, 10, SUIT_DARK);
  fillRect(g, 40, 23, 4, 10, SUIT_DARK);

  const TIE = "#ffd700";
  fillRect(g, 31, 23, 2, 2, TIE);
  fillRect(g, 30, 25, 4, 2, TIE);
  fillRect(g, 31, 27, 2, 10, TIE);

  fillRect(g, 14, 24, 4, 14, SUIT);
  fillRect(g, 46, 24, 4, 14, SUIT);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  fillRect(g, 10, 34, 6, 9, "#c8a870");
  fillRect(g, 11, 35, 4, 7, WHITE);
  fillRect(g, 12, 36, 2, 1, "#888");
  fillRect(g, 12, 38, 2, 1, "#888");

  fillRect(g, 20, 41, 24, 2, SUIT_DARK);
  fillRect(g, 30, 41, 4, 2, "#c0c0c0");

  const PANTS = "#0d2240";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  fillRect(g, 20, 55, 12, 3, SHOE_BLACK);
  fillRect(g, 32, 55, 12, 3, SHOE_BLACK);

  return g;
}

const SECRETARY_LAYOUT: HumanoidLayout = {
  leftLegX: 22, rightLegX: 34, legY: 43, legW: 8, legH: 12, legColor: "#0d2240",
  leftShoeX: 20, rightShoeX: 32, shoeY: 55, shoeW: 12, shoeH: 3, shoeColor: SHOE_BLACK,
  rightArmX: 46, armY: 24, armW: 4, armH: 14, armColor: "#1a3a6a",
  rightHandX: 46, handY: 38, handW: 4, handH: 3,
  mouthY: 17, beltY: 41,
};

function buildSherlock(): PixelGrid {
  const g = createGrid();

  const HAT = "#8b6535";
  const HAT_DARK = "#6b4520";
  fillRect(g, 22, 1, 20, 4, HAT);
  fillRect(g, 20, 3, 24, 3, HAT);
  fillRect(g, 18, 5, 28, 2, HAT_DARK);
  fillRect(g, 18, 7, 4, 5, HAT);
  fillRect(g, 42, 7, 4, 5, HAT);

  fillEllipse(g, 32, 14, 11, 8, SKIN);

  fillRect(g, 26, 12, 3, 2, EYE_BLACK);
  fillRect(g, 35, 12, 3, 2, EYE_BLACK);
  fillRect(g, 25, 10, 5, 1, HAIR_BROWN);
  fillRect(g, 34, 10, 5, 1, HAIR_BROWN);

  fillRect(g, 31, 15, 2, 2, SKIN_SHADOW);
  fillRect(g, 29, 18, 6, 1, "#cc8866");
  fillRect(g, 29, 21, 6, 3, SKIN);

  const COAT = "#a07040";
  const COAT_DARK = "#7a5530";
  fillRect(g, 18, 24, 28, 4, COAT);
  fillRect(g, 20, 28, 24, 13, COAT);
  fillRect(g, 20, 24, 4, 3, COAT_DARK);
  fillRect(g, 40, 24, 4, 3, COAT_DARK);
  setPixel(g, 32, 29, "#d4a843");
  setPixel(g, 32, 32, "#d4a843");
  setPixel(g, 32, 35, "#d4a843");

  fillRect(g, 14, 25, 4, 13, COAT);
  fillRect(g, 46, 25, 4, 13, COAT);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  fillRect(g, 48, 36, 2, 8, "#a0a8b4");
  fillCircle(g, 49, 32, 4, "#a0a8b4");
  fillCircle(g, 49, 32, 3, "#88ccff");

  fillRect(g, 20, 41, 24, 2, COAT_DARK);

  const PANTS = "#5a4030";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  fillRect(g, 20, 55, 12, 3, "#4a3020");
  fillRect(g, 32, 55, 12, 3, "#4a3020");

  return g;
}

const SHERLOCK_LAYOUT: HumanoidLayout = {
  leftLegX: 22, rightLegX: 34, legY: 43, legW: 8, legH: 12, legColor: "#5a4030",
  leftShoeX: 20, rightShoeX: 32, shoeY: 55, shoeW: 12, shoeH: 3, shoeColor: "#4a3020",
  rightArmX: 46, armY: 25, armW: 4, armH: 13, armColor: "#a07040",
  rightHandX: 46, handY: 38, handW: 4, handH: 3,
  mouthY: 18, beltY: 41,
};

function buildLego(): PixelGrid {
  const g = createGrid();

  const HELM = "#f57c20";
  const HELM_DARK = "#d06010";
  fillRect(g, 22, 1, 20, 3, HELM);
  fillRect(g, 18, 4, 28, 3, HELM);
  fillRect(g, 20, 3, 24, 2, HELM_DARK);
  fillRect(g, 16, 6, 32, 1, HELM_DARK);

  fillEllipse(g, 32, 13, 11, 7, SKIN);

  fillRect(g, 26, 11, 3, 2, EYE_BLACK);
  fillRect(g, 35, 11, 3, 2, EYE_BLACK);
  fillRect(g, 25, 9, 5, 1, HAIR_BLACK);
  fillRect(g, 34, 9, 5, 1, HAIR_BLACK);

  fillRect(g, 31, 14, 2, 2, SKIN_SHADOW);
  fillRect(g, 28, 17, 8, 1, "#c0392b");
  fillRect(g, 29, 20, 6, 3, SKIN);

  const VEST = "#6b7b8a";
  const STRIPE = "#f57c20";
  fillRect(g, 18, 23, 28, 4, VEST);
  fillRect(g, 20, 27, 24, 14, VEST);
  fillRect(g, 18, 23, 4, 2, STRIPE);
  fillRect(g, 42, 23, 4, 2, STRIPE);
  fillRect(g, 20, 25, 2, 12, STRIPE);
  fillRect(g, 42, 25, 2, 12, STRIPE);

  fillRect(g, 14, 24, 4, 14, VEST);
  fillRect(g, 46, 24, 4, 14, VEST);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  fillRect(g, 48, 30, 3, 12, "#d0e0f0");
  fillRect(g, 48, 29, 3, 2, "#a0b0c0");
  fillRect(g, 48, 41, 3, 2, "#a0b0c0");

  fillRect(g, 20, 41, 24, 2, "#4a5560");
  fillRect(g, 30, 41, 4, 2, "#d4a843");

  const PANTS = "#4a5560";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  fillRect(g, 20, 55, 12, 3, "#5a4030");
  fillRect(g, 32, 55, 12, 3, "#5a4030");

  return g;
}

const LEGO_LAYOUT: HumanoidLayout = {
  leftLegX: 22, rightLegX: 34, legY: 43, legW: 8, legH: 12, legColor: "#4a5560",
  leftShoeX: 20, rightShoeX: 32, shoeY: 55, shoeW: 12, shoeH: 3, shoeColor: "#5a4030",
  rightArmX: 46, armY: 24, armW: 4, armH: 14, armColor: "#6b7b8a",
  rightHandX: 46, handY: 38, handW: 4, handH: 3,
  mouthY: 17, beltY: 41,
};

function buildVault(): PixelGrid {
  const g = createGrid();

  fillRect(g, 23, 3, 18, 4, HAIR_BLACK);
  fillRect(g, 21, 5, 22, 2, HAIR_BLACK);

  const GOGGLE_FRAME = "#555";
  const GOGGLE_LENS = "#55aaee";
  fillRect(g, 22, 5, 7, 3, GOGGLE_FRAME);
  fillRect(g, 35, 5, 7, 3, GOGGLE_FRAME);
  fillRect(g, 23, 6, 5, 1, GOGGLE_LENS);
  fillRect(g, 36, 6, 5, 1, GOGGLE_LENS);
  fillRect(g, 29, 6, 6, 1, "#888");

  fillEllipse(g, 32, 13, 11, 7, SKIN);

  fillRect(g, 26, 11, 3, 2, EYE_BLACK);
  fillRect(g, 35, 11, 3, 2, EYE_BLACK);
  fillRect(g, 25, 9, 5, 1, HAIR_BLACK);
  fillRect(g, 34, 9, 5, 1, HAIR_BLACK);

  fillRect(g, 31, 14, 2, 2, SKIN_SHADOW);
  fillRect(g, 29, 17, 6, 1, "#cc8866");
  fillRect(g, 29, 20, 6, 3, SKIN);

  const COVER = "#2a5a3a";
  const COVER_DARK = "#1a3a2a";
  fillRect(g, 18, 23, 28, 4, COVER);
  fillRect(g, 20, 27, 24, 14, COVER);
  fillRect(g, 22, 30, 6, 4, COVER_DARK);
  fillRect(g, 36, 30, 6, 4, COVER_DARK);
  vLine(g, 32, 23, 18, "#888");

  fillRect(g, 14, 24, 4, 14, COVER);
  fillRect(g, 46, 24, 4, 14, COVER);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  const KEY_GOLD = "#ffd700";
  fillRect(g, 20, 41, 24, 2, COVER_DARK);
  fillRect(g, 42, 42, 2, 3, "#888");
  fillRect(g, 41, 45, 4, 2, KEY_GOLD);
  fillRect(g, 43, 44, 2, 3, KEY_GOLD);
  setPixel(g, 40, 46, KEY_GOLD);

  const PANTS = "#1a3a2a";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  fillRect(g, 20, 55, 12, 3, "#3a3a2a");
  fillRect(g, 32, 55, 12, 3, "#3a3a2a");

  return g;
}

const VAULT_LAYOUT: HumanoidLayout = {
  leftLegX: 22, rightLegX: 34, legY: 43, legW: 8, legH: 12, legColor: "#1a3a2a",
  leftShoeX: 20, rightShoeX: 32, shoeY: 55, shoeW: 12, shoeH: 3, shoeColor: "#3a3a2a",
  rightArmX: 46, armY: 24, armW: 4, armH: 14, armColor: "#2a5a3a",
  rightHandX: 46, handY: 38, handW: 4, handH: 3,
  mouthY: 17, beltY: 41,
};

function buildForge(): PixelGrid {
  const g = createGrid();

  fillRect(g, 22, 2, 20, 5, HAIR_BLACK);
  fillRect(g, 20, 4, 24, 3, HAIR_BLACK);

  fillEllipse(g, 32, 13, 11, 8, SKIN);

  fillRect(g, 26, 11, 3, 2, EYE_BLACK);
  fillRect(g, 35, 11, 3, 2, EYE_BLACK);
  fillRect(g, 25, 9, 5, 1, HAIR_BLACK);
  fillRect(g, 34, 9, 5, 1, HAIR_BLACK);

  fillRect(g, 31, 14, 2, 2, SKIN_SHADOW);
  fillRect(g, 29, 17, 6, 1, "#cc8866");
  fillRect(g, 29, 20, 6, 3, SKIN);

  const SHIRT = "#2a2a2a";
  fillRect(g, 18, 23, 28, 4, SHIRT);
  fillRect(g, 20, 27, 24, 14, SHIRT);

  const APRON = "#cc3333";
  const APRON_DARK = "#aa2222";
  fillRect(g, 24, 26, 16, 15, APRON);
  fillRect(g, 28, 24, 2, 2, APRON_DARK);
  fillRect(g, 34, 24, 2, 2, APRON_DARK);
  fillRect(g, 28, 34, 8, 4, APRON_DARK);

  fillRect(g, 14, 24, 4, 14, SHIRT);
  fillRect(g, 46, 24, 4, 14, SHIRT);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  fillRect(g, 11, 30, 2, 12, "#8b6535");
  fillRect(g, 8, 28, 8, 3, "#c0c0c0");
  fillRect(g, 9, 27, 6, 1, "#a0a8b4");

  fillRect(g, 20, 41, 24, 2, "#444");
  fillRect(g, 30, 41, 4, 2, "#888");

  const PANTS = "#333";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  fillRect(g, 20, 55, 12, 3, SHOE_BLACK);
  fillRect(g, 32, 55, 12, 3, SHOE_BLACK);

  return g;
}

const FORGE_LAYOUT: HumanoidLayout = {
  leftLegX: 22, rightLegX: 34, legY: 43, legW: 8, legH: 12, legColor: "#333",
  leftShoeX: 20, rightShoeX: 32, shoeY: 55, shoeW: 12, shoeH: 3, shoeColor: SHOE_BLACK,
  rightArmX: 46, armY: 24, armW: 4, armH: 14, armColor: "#2a2a2a",
  rightHandX: 46, handY: 38, handW: 4, handH: 3,
  mouthY: 17, beltY: 41,
};

function buildLens(): PixelGrid {
  const g = createGrid();

  fillRect(g, 22, 2, 20, 5, "#5a4030");
  fillRect(g, 20, 4, 24, 3, "#5a4030");

  fillEllipse(g, 32, 13, 11, 8, SKIN);

  const GLASS = "#88bbee";
  const FRAME = "#6699cc";
  fillRect(g, 24, 10, 6, 4, FRAME);
  fillRect(g, 25, 11, 4, 2, GLASS);
  fillRect(g, 34, 10, 6, 4, FRAME);
  fillRect(g, 35, 11, 4, 2, GLASS);
  fillRect(g, 30, 11, 4, 1, FRAME);

  fillRect(g, 26, 11, 2, 2, EYE_BLACK);
  fillRect(g, 36, 11, 2, 2, EYE_BLACK);
  fillRect(g, 25, 9, 5, 1, "#5a4030");
  fillRect(g, 34, 9, 5, 1, "#5a4030");

  fillRect(g, 31, 14, 2, 2, SKIN_SHADOW);
  fillRect(g, 29, 17, 6, 1, "#cc8866");
  fillRect(g, 29, 20, 6, 3, SKIN);

  const COAT = "#f0f0f0";
  const COAT_SHADOW = "#d8d8d8";
  fillRect(g, 16, 23, 32, 4, COAT);
  fillRect(g, 18, 27, 28, 14, COAT);
  fillRect(g, 18, 23, 4, 3, COAT_SHADOW);
  fillRect(g, 42, 23, 4, 3, COAT_SHADOW);
  vLine(g, 22, 23, 18, COAT_SHADOW);
  vLine(g, 42, 23, 18, COAT_SHADOW);
  fillRect(g, 28, 24, 8, 6, "#d0e8ff");

  fillRect(g, 24, 27, 5, 4, COAT_SHADOW);
  fillRect(g, 25, 26, 1, 3, "#2255aa");
  setPixel(g, 25, 25, "#d4a843");

  fillRect(g, 12, 24, 4, 14, COAT);
  fillRect(g, 48, 24, 4, 14, COAT);
  fillRect(g, 12, 38, 4, 3, SKIN);
  fillRect(g, 48, 38, 4, 3, SKIN);

  fillRect(g, 50, 36, 2, 6, "#a0a8b4");
  fillCircle(g, 51, 33, 3, "#a0a8b4");
  fillCircle(g, 51, 33, 2, "#aaddff");

  const PANTS = "#555";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  fillRect(g, 20, 55, 12, 3, SHOE_BLACK);
  fillRect(g, 32, 55, 12, 3, SHOE_BLACK);

  return g;
}

const LENS_LAYOUT: HumanoidLayout = {
  leftLegX: 22, rightLegX: 34, legY: 43, legW: 8, legH: 12, legColor: "#555",
  leftShoeX: 20, rightShoeX: 32, shoeY: 55, shoeW: 12, shoeH: 3, shoeColor: SHOE_BLACK,
  rightArmX: 48, armY: 24, armW: 4, armH: 14, armColor: "#f0f0f0",
  rightHandX: 48, handY: 38, handW: 4, handH: 3,
  mouthY: 17, beltY: 41,
};

function buildWaffles(): PixelGrid {
  const g = createGrid();

  const BASE_Y = 24;
  const ORANGE = "#e8a030";
  const ORANGE_DARK = "#c88020";
  const BELLY_WHITE = "#fff8e8";

  // --- Ears ---
  fillRect(g, 22, BASE_Y, 5, 2, ORANGE_DARK);
  fillRect(g, 23, BASE_Y + 2, 4, 2, ORANGE);
  fillRect(g, 24, BASE_Y + 4, 3, 2, ORANGE);
  fillRect(g, 25, BASE_Y + 6, 2, 1, ORANGE);
  fillRect(g, 32, BASE_Y, 5, 2, ORANGE_DARK);
  fillRect(g, 33, BASE_Y + 2, 4, 2, ORANGE);
  fillRect(g, 34, BASE_Y + 4, 3, 2, ORANGE);
  fillRect(g, 35, BASE_Y + 6, 2, 1, ORANGE);

  // --- Head ---
  fillEllipse(g, 30, BASE_Y + 11, 10, 5, ORANGE);
  fillEllipse(g, 30, BASE_Y + 12, 6, 4, BELLY_WHITE);

  // --- Eyes ---
  fillRect(g, 26, BASE_Y + 10, 2, 2, EYE_BLACK);
  fillRect(g, 33, BASE_Y + 10, 2, 2, EYE_BLACK);
  setPixel(g, 26, BASE_Y + 10, "#555");
  setPixel(g, 33, BASE_Y + 10, "#555");

  // --- Nose ---
  fillRect(g, 29, BASE_Y + 13, 3, 2, EYE_BLACK);

  // --- Tongue ---
  fillRect(g, 30, BASE_Y + 15, 2, 2, "#ff8888");

  // --- Body ---
  fillEllipse(g, 30, BASE_Y + 24, 12, 7, ORANGE);
  fillEllipse(g, 30, BASE_Y + 26, 10, 4, BELLY_WHITE);

  // --- Short legs ---
  fillRect(g, 20, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(g, 24, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(g, 34, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(g, 38, BASE_Y + 29, 4, 6, ORANGE_DARK);
  // Paws
  fillRect(g, 20, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(g, 24, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(g, 34, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(g, 38, BASE_Y + 35, 4, 2, BELLY_WHITE);

  // --- Tail ---
  fillRect(g, 40, BASE_Y + 19, 3, 2, ORANGE);
  fillRect(g, 42, BASE_Y + 17, 3, 3, ORANGE);
  fillRect(g, 44, BASE_Y + 16, 2, 2, ORANGE);

  return g;
}

// ============================================================
// Waffles-specific pose modifiers
// ============================================================

function wafflesWalking(base: PixelGrid): [PixelGrid, PixelGrid] {
  const BASE_Y = 24;
  const ORANGE_DARK = "#c88020";
  const BELLY_WHITE = "#fff8e8";

  // Frame A: front legs forward, back legs back
  const a = cloneGrid(base);
  // Clear all legs
  clearRect(a, 20, BASE_Y + 29, 8, 8);
  clearRect(a, 34, BASE_Y + 29, 8, 8);
  // Front-left forward, front-right back
  fillRect(a, 18, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(a, 26, BASE_Y + 29, 4, 6, ORANGE_DARK);
  // Back-left back, back-right forward
  fillRect(a, 36, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(a, 32, BASE_Y + 29, 4, 6, ORANGE_DARK);
  // Paws
  fillRect(a, 18, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(a, 26, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(a, 32, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(a, 36, BASE_Y + 35, 4, 2, BELLY_WHITE);

  // Frame B: opposite
  const b = cloneGrid(base);
  clearRect(b, 20, BASE_Y + 29, 8, 8);
  clearRect(b, 34, BASE_Y + 29, 8, 8);
  fillRect(b, 22, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(b, 28, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(b, 34, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(b, 40, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(b, 22, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(b, 28, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(b, 34, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(b, 40, BASE_Y + 35, 4, 2, BELLY_WHITE);

  return [a, b];
}

function wafflesSitting(base: PixelGrid): PixelGrid {
  const g = cloneGrid(base);
  const BASE_Y = 24;
  const ORANGE = "#e8a030";
  const ORANGE_DARK = "#c88020";
  const BELLY_WHITE = "#fff8e8";

  // Clear legs and body bottom
  clearRect(g, 18, BASE_Y + 27, 28, 12);
  // Redraw body slightly lower (sitting position)
  fillEllipse(g, 30, BASE_Y + 26, 12, 6, ORANGE);
  fillEllipse(g, 30, BASE_Y + 28, 10, 3, BELLY_WHITE);
  // Shorter front legs
  fillRect(g, 22, BASE_Y + 31, 4, 4, ORANGE_DARK);
  fillRect(g, 26, BASE_Y + 31, 4, 4, ORANGE_DARK);
  fillRect(g, 22, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(g, 26, BASE_Y + 35, 4, 2, BELLY_WHITE);
  // Back legs tucked (barely visible)
  fillRect(g, 35, BASE_Y + 32, 6, 3, ORANGE_DARK);
  fillRect(g, 35, BASE_Y + 35, 6, 2, BELLY_WHITE);
  return g;
}

function wafflesSleeping(_base: PixelGrid): PixelGrid {
  // Completely different pose: lying flat
  const g = createGrid();
  const BASE_Y = 38; // lower on canvas since flat

  const ORANGE = "#e8a030";
  const ORANGE_DARK = "#c88020";
  const BELLY_WHITE = "#fff8e8";

  // --- Flat body (horizontal ellipse) ---
  fillEllipse(g, 32, BASE_Y, 18, 5, ORANGE);
  fillEllipse(g, 32, BASE_Y + 1, 16, 3, BELLY_WHITE);

  // --- Head resting on paws (left side) ---
  fillEllipse(g, 16, BASE_Y - 2, 7, 5, ORANGE);
  fillEllipse(g, 16, BASE_Y - 1, 4, 3, BELLY_WHITE);

  // --- Closed eyes ---
  hLine(g, 13, BASE_Y - 3, 3, EYE_BLACK);
  hLine(g, 18, BASE_Y - 3, 3, EYE_BLACK);

  // --- Nose ---
  fillRect(g, 15, BASE_Y - 1, 2, 1, EYE_BLACK);

  // --- Ears (flopped) ---
  fillRect(g, 11, BASE_Y - 6, 4, 2, ORANGE_DARK);
  fillRect(g, 19, BASE_Y - 6, 4, 2, ORANGE_DARK);

  // --- Front paws extended ---
  fillRect(g, 10, BASE_Y + 2, 6, 3, ORANGE_DARK);
  fillRect(g, 10, BASE_Y + 4, 6, 2, BELLY_WHITE);

  // --- Back paws ---
  fillRect(g, 46, BASE_Y + 1, 5, 3, ORANGE_DARK);
  fillRect(g, 46, BASE_Y + 3, 5, 2, BELLY_WHITE);

  // --- Tail curled ---
  fillRect(g, 48, BASE_Y - 3, 3, 2, ORANGE);
  fillRect(g, 50, BASE_Y - 2, 2, 2, ORANGE);

  return g;
}

// ============================================================
// Character registry with pose support
// ============================================================

type OptRect = { x: number; y: number; w: number; h: number; color: string };

interface CharacterPoses {
  base: () => PixelGrid;
  layout?: HumanoidLayout; // undefined for non-humanoid (Waffles)
  // Custom overrides for non-standard characters
  walkingOverride?: (base: PixelGrid) => [PixelGrid, PixelGrid];
  sittingOverride?: (base: PixelGrid) => PixelGrid;
  sleepingOverride?: (base: PixelGrid) => PixelGrid;
}

const characterRegistry: Record<string, CharacterPoses> = {
  boss: { base: buildBoss, layout: BOSS_LAYOUT },
  secretary: { base: buildSecretary, layout: SECRETARY_LAYOUT },
  sherlock: { base: buildSherlock, layout: SHERLOCK_LAYOUT },
  lego: { base: buildLego, layout: LEGO_LAYOUT },
  vault: { base: buildVault, layout: VAULT_LAYOUT },
  forge: { base: buildForge, layout: FORGE_LAYOUT },
  lens: { base: buildLens, layout: LENS_LAYOUT },
  waffles: {
    base: buildWaffles,
    walkingOverride: (base) => wafflesWalking(base),
    sittingOverride: (base) => wafflesSitting(base),
    sleepingOverride: (base) => wafflesSleeping(base),
  },
};

// Cache: key = "characterId-pose" or "characterId-pose-frameN"
const poseCache = new Map<string, OptRect[]>();

function getRectsForPose(
  characterId: string,
  pose: CharacterPose
): OptRect[] | [OptRect[], OptRect[]] {
  const entry = characterRegistry[characterId] || characterRegistry["secretary"];
  const baseGrid = entry.base();

  if (pose === "standing") {
    const key = `${characterId}-standing`;
    if (poseCache.has(key)) return poseCache.get(key)!;
    const rects = optimizeRects(gridToRects(baseGrid));
    poseCache.set(key, rects);
    return rects;
  }

  if (pose === "walking") {
    const keyA = `${characterId}-walking-0`;
    const keyB = `${characterId}-walking-1`;
    if (poseCache.has(keyA) && poseCache.has(keyB)) {
      return [poseCache.get(keyA)!, poseCache.get(keyB)!];
    }
    let frames: [PixelGrid, PixelGrid];
    if (entry.walkingOverride) {
      frames = entry.walkingOverride(baseGrid);
    } else if (entry.layout) {
      frames = applyWalking(baseGrid, entry.layout);
    } else {
      // Fallback: just return base as both frames
      const rects = optimizeRects(gridToRects(baseGrid));
      poseCache.set(keyA, rects);
      poseCache.set(keyB, rects);
      return [rects, rects];
    }
    const rectsA = optimizeRects(gridToRects(frames[0]));
    const rectsB = optimizeRects(gridToRects(frames[1]));
    poseCache.set(keyA, rectsA);
    poseCache.set(keyB, rectsB);
    return [rectsA, rectsB];
  }

  if (pose === "sitting") {
    const key = `${characterId}-sitting`;
    if (poseCache.has(key)) return poseCache.get(key)!;
    let grid: PixelGrid;
    if (entry.sittingOverride) {
      grid = entry.sittingOverride(baseGrid);
    } else if (entry.layout) {
      grid = applySitting(baseGrid, entry.layout);
    } else {
      grid = baseGrid;
    }
    const rects = optimizeRects(gridToRects(grid));
    poseCache.set(key, rects);
    return rects;
  }

  if (pose === "drinking") {
    const key = `${characterId}-drinking`;
    if (poseCache.has(key)) return poseCache.get(key)!;
    let grid: PixelGrid;
    if (entry.layout) {
      grid = applyDrinking(baseGrid, entry.layout);
    } else {
      // Non-humanoid: just use base
      grid = baseGrid;
    }
    const rects = optimizeRects(gridToRects(grid));
    poseCache.set(key, rects);
    return rects;
  }

  if (pose === "sleeping") {
    const key = `${characterId}-sleeping`;
    if (poseCache.has(key)) return poseCache.get(key)!;
    let grid: PixelGrid;
    if (entry.sleepingOverride) {
      grid = entry.sleepingOverride(baseGrid);
    } else {
      // Humanoid sleeping: just use standing (no custom sleeping pose)
      grid = baseGrid;
    }
    const rects = optimizeRects(gridToRects(grid));
    poseCache.set(key, rects);
    return rects;
  }

  // Fallback
  const key = `${characterId}-standing`;
  if (poseCache.has(key)) return poseCache.get(key)!;
  const rects = optimizeRects(gridToRects(baseGrid));
  poseCache.set(key, rects);
  return rects;
}

// ============================================================
// Status animation & indicator (same logic as old component)
// ============================================================

function getStatusAnimation(status: MemberStatus): string {
  switch (status) {
    case "idle":
      return "animate-idle";
    case "working":
      return "animate-working";
    case "meeting":
      return "animate-sway";
    case "sleeping":
      return "animate-idle";
    case "celebrating":
      return "animate-celebrate";
    default:
      return "animate-idle";
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
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 animate-speech">
          <div className="bg-white text-gray-800 text-xs px-2 py-1 rounded shadow pixel-text">
            ...
          </div>
        </div>
      );
    case "sleeping":
      return (
        <div className="absolute -top-6 right-0">
          <span className="text-blue-300 text-[10px] animate-zzz inline-block">
            Z
          </span>
          <span
            className="text-blue-300 text-xs animate-zzz inline-block"
            style={{ animationDelay: "0.5s" }}
          >
            Z
          </span>
          <span
            className="text-blue-300 text-sm animate-zzz inline-block"
            style={{ animationDelay: "1s" }}
          >
            Z
          </span>
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

// ============================================================
// Main component
// ============================================================

interface PixelCharacterSVGProps {
  member: MemberData;
  pose?: CharacterPose;
  onClick?: () => void;
  isWagging?: boolean;
}

export default function PixelCharacterSVG({
  member,
  pose = "standing",
  onClick,
  isWagging = false,
}: PixelCharacterSVGProps) {
  const poseData = getRectsForPose(member.id, pose);
  const isWalkingPose = Array.isArray(poseData[0]);

  const animClass =
    member.id === "waffles" && isWagging
      ? "animate-wag"
      : getStatusAnimation(member.status);

  if (isWalkingPose) {
    // Walking: two-frame CSS animation
    const [frameA, frameB] = poseData as [OptRect[], OptRect[]];
    return (
      <div
        className={`relative cursor-pointer group ${animClass}`}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={`${member.nameCn} - ${member.name}`}
      >
        <StatusIndicator status={member.status} />
        <div className="walk-frame-container w-16 h-16 sm:w-20 sm:h-20 relative">
          <svg
            viewBox="0 0 64 64"
            className="walk-frame-a absolute inset-0 w-full h-full"
            style={{ imageRendering: "pixelated" }}
            xmlns="http://www.w3.org/2000/svg"
          >
            {frameA.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.color} />
            ))}
          </svg>
          <svg
            viewBox="0 0 64 64"
            className="walk-frame-b absolute inset-0 w-full h-full"
            style={{ imageRendering: "pixelated" }}
            xmlns="http://www.w3.org/2000/svg"
          >
            {frameB.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.color} />
            ))}
          </svg>
        </div>
        {/* Hover tooltip */}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
          <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg">
            {member.nameCn}
          </div>
        </div>
      </div>
    );
  }

  // Single-frame poses (standing, sitting, drinking, sleeping)
  const rects = poseData as OptRect[];
  return (
    <div
      className={`relative cursor-pointer group ${animClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${member.nameCn} - ${member.name}`}
    >
      <StatusIndicator status={member.status} />
      <svg
        viewBox="0 0 64 64"
        className="w-16 h-16 sm:w-20 sm:h-20"
        style={{ imageRendering: "pixelated" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {rects.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill={r.color}
          />
        ))}
      </svg>
      {/* Hover tooltip */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
        <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg">
          {member.nameCn}
        </div>
      </div>
    </div>
  );
}
