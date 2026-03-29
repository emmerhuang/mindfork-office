"use client";

import { MemberData, MemberStatus } from "@/types";

// ============================================================
// Pixel grid helpers — build 64x64 characters without listing 4096 pixels
// ============================================================
type PixelGrid = Map<string, string>; // key = "x,y" → color

function createGrid(): PixelGrid {
  return new Map();
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
  // Group by color and y, then merge horizontal runs
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

// ============================================================
// Character builders
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
  // Eyebrows
  fillRect(g, 25, 9, 5, 1, HAIR_BLACK);
  fillRect(g, 34, 9, 5, 1, HAIR_BLACK);

  // --- Nose ---
  fillRect(g, 31, 13, 2, 2, SKIN_SHADOW);

  // --- Mouth (confident smirk) ---
  fillRect(g, 28, 16, 8, 1, "#c0392b");
  fillRect(g, 29, 17, 6, 1, "#a83226");

  // --- Neck ---
  fillRect(g, 29, 20, 6, 3, SKIN);

  // --- Suit body (dark red) ---
  const SUIT = "#8b0000";
  const SUIT_DARK = "#6b0000";
  // Shoulders
  fillRect(g, 18, 23, 28, 4, SUIT);
  // Torso
  fillRect(g, 20, 27, 24, 14, SUIT);
  // Lapels
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
  // Hands
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  // --- Coffee cup in right hand ---
  fillRect(g, 47, 34, 6, 7, "#8b7355"); // cup body
  fillRect(g, 48, 35, 4, 5, "#5c3d1e"); // cup dark fill
  fillRect(g, 49, 33, 2, 2, STEAM);     // steam
  fillRect(g, 50, 31, 2, 2, STEAM);

  // --- Belt ---
  fillRect(g, 20, 41, 24, 2, SUIT_DARK);
  fillRect(g, 30, 41, 4, 2, "#d4a843"); // buckle

  // --- Legs (dark pants) ---
  const PANTS = "#4a0000";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  // --- Shoes ---
  fillRect(g, 20, 55, 12, 3, SHOE_BLACK);
  fillRect(g, 32, 55, 12, 3, SHOE_BLACK);

  return g;
}

function buildSecretary(): PixelGrid {
  const g = createGrid();

  // --- Hair ---
  fillRect(g, 22, 2, 20, 5, HAIR_BLACK);
  fillRect(g, 20, 4, 24, 3, HAIR_BLACK);

  // --- Head ---
  fillEllipse(g, 32, 13, 11, 8, SKIN);

  // --- Glasses (silver frame) ---
  const GLASS = "#a0a8b4";
  // Left lens
  fillRect(g, 24, 10, 6, 4, GLASS);
  fillRect(g, 25, 11, 4, 2, "#d0e8ff"); // lens
  // Right lens
  fillRect(g, 34, 10, 6, 4, GLASS);
  fillRect(g, 35, 11, 4, 2, "#d0e8ff");
  // Bridge
  fillRect(g, 30, 11, 4, 1, GLASS);

  // --- Eyes behind glasses ---
  fillRect(g, 26, 11, 2, 2, EYE_BLACK);
  fillRect(g, 36, 11, 2, 2, EYE_BLACK);
  // Eyebrows
  fillRect(g, 25, 9, 5, 1, HAIR_BLACK);
  fillRect(g, 34, 9, 5, 1, HAIR_BLACK);

  // --- Nose ---
  fillRect(g, 31, 14, 2, 2, SKIN_SHADOW);

  // --- Mouth ---
  fillRect(g, 29, 17, 6, 1, "#cc8866");

  // --- Neck ---
  fillRect(g, 29, 20, 6, 3, SKIN);

  // --- Suit (dark blue) ---
  const SUIT = "#1a3a6a";
  const SUIT_DARK = "#0d2240";
  fillRect(g, 18, 23, 28, 4, SUIT);
  fillRect(g, 20, 27, 24, 14, SUIT);
  fillRect(g, 20, 23, 4, 10, SUIT_DARK);
  fillRect(g, 40, 23, 4, 10, SUIT_DARK);

  // --- Gold tie ---
  const TIE = "#ffd700";
  fillRect(g, 31, 23, 2, 2, TIE);
  fillRect(g, 30, 25, 4, 2, TIE);
  fillRect(g, 31, 27, 2, 10, TIE);

  // --- Arms ---
  fillRect(g, 14, 24, 4, 14, SUIT);
  fillRect(g, 46, 24, 4, 14, SUIT);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  // --- Document folder in left hand ---
  fillRect(g, 10, 34, 6, 9, "#c8a870"); // folder
  fillRect(g, 11, 35, 4, 7, WHITE);      // papers
  fillRect(g, 12, 36, 2, 1, "#888");     // text line
  fillRect(g, 12, 38, 2, 1, "#888");

  // --- Belt ---
  fillRect(g, 20, 41, 24, 2, SUIT_DARK);
  fillRect(g, 30, 41, 4, 2, "#c0c0c0");

  // --- Legs ---
  const PANTS = "#0d2240";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  // --- Shoes ---
  fillRect(g, 20, 55, 12, 3, SHOE_BLACK);
  fillRect(g, 32, 55, 12, 3, SHOE_BLACK);

  return g;
}

function buildSherlock(): PixelGrid {
  const g = createGrid();

  // --- Deerstalker hat ---
  const HAT = "#8b6535";
  const HAT_DARK = "#6b4520";
  // Hat crown
  fillRect(g, 22, 1, 20, 4, HAT);
  fillRect(g, 20, 3, 24, 3, HAT);
  // Hat brim (front)
  fillRect(g, 18, 5, 28, 2, HAT_DARK);
  // Ear flaps
  fillRect(g, 18, 7, 4, 5, HAT);
  fillRect(g, 42, 7, 4, 5, HAT);

  // --- Head ---
  fillEllipse(g, 32, 14, 11, 8, SKIN);

  // --- Eyes ---
  fillRect(g, 26, 12, 3, 2, EYE_BLACK);
  fillRect(g, 35, 12, 3, 2, EYE_BLACK);
  fillRect(g, 25, 10, 5, 1, HAIR_BROWN);
  fillRect(g, 34, 10, 5, 1, HAIR_BROWN);

  // --- Nose ---
  fillRect(g, 31, 15, 2, 2, SKIN_SHADOW);

  // --- Mouth ---
  fillRect(g, 29, 18, 6, 1, "#cc8866");

  // --- Neck ---
  fillRect(g, 29, 21, 6, 3, SKIN);

  // --- Trench coat (brown) ---
  const COAT = "#a07040";
  const COAT_DARK = "#7a5530";
  fillRect(g, 18, 24, 28, 4, COAT);
  fillRect(g, 20, 28, 24, 13, COAT);
  // Coat collar
  fillRect(g, 20, 24, 4, 3, COAT_DARK);
  fillRect(g, 40, 24, 4, 3, COAT_DARK);
  // Coat buttons
  setPixel(g, 32, 29, "#d4a843");
  setPixel(g, 32, 32, "#d4a843");
  setPixel(g, 32, 35, "#d4a843");

  // --- Arms ---
  fillRect(g, 14, 25, 4, 13, COAT);
  fillRect(g, 46, 25, 4, 13, COAT);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  // --- Magnifying glass in right hand ---
  // Handle
  fillRect(g, 48, 36, 2, 8, "#a0a8b4");
  // Lens circle
  fillCircle(g, 49, 32, 4, "#a0a8b4");
  fillCircle(g, 49, 32, 3, "#88ccff");

  // --- Belt ---
  fillRect(g, 20, 41, 24, 2, COAT_DARK);

  // --- Legs ---
  const PANTS = "#5a4030";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  // --- Shoes ---
  fillRect(g, 20, 55, 12, 3, "#4a3020");
  fillRect(g, 32, 55, 12, 3, "#4a3020");

  return g;
}

function buildLego(): PixelGrid {
  const g = createGrid();

  // --- Safety helmet (orange) ---
  const HELM = "#f57c20";
  const HELM_DARK = "#d06010";
  fillRect(g, 22, 1, 20, 3, HELM);
  fillRect(g, 18, 4, 28, 3, HELM);
  fillRect(g, 20, 3, 24, 2, HELM_DARK); // helmet band
  fillRect(g, 16, 6, 32, 1, HELM_DARK); // brim

  // --- Head ---
  fillEllipse(g, 32, 13, 11, 7, SKIN);

  // --- Eyes ---
  fillRect(g, 26, 11, 3, 2, EYE_BLACK);
  fillRect(g, 35, 11, 3, 2, EYE_BLACK);
  fillRect(g, 25, 9, 5, 1, HAIR_BLACK);
  fillRect(g, 34, 9, 5, 1, HAIR_BLACK);

  // --- Nose ---
  fillRect(g, 31, 14, 2, 2, SKIN_SHADOW);

  // --- Mouth (friendly grin) ---
  fillRect(g, 28, 17, 8, 1, "#c0392b");

  // --- Neck ---
  fillRect(g, 29, 20, 6, 3, SKIN);

  // --- Work vest (gray) with orange shoulder stripes ---
  const VEST = "#6b7b8a";
  const STRIPE = "#f57c20";
  fillRect(g, 18, 23, 28, 4, VEST);
  fillRect(g, 20, 27, 24, 14, VEST);
  // Orange shoulder stripes
  fillRect(g, 18, 23, 4, 2, STRIPE);
  fillRect(g, 42, 23, 4, 2, STRIPE);
  // V-stripe on vest
  fillRect(g, 20, 25, 2, 12, STRIPE);
  fillRect(g, 42, 25, 2, 12, STRIPE);

  // --- Arms ---
  fillRect(g, 14, 24, 4, 14, VEST);
  fillRect(g, 46, 24, 4, 14, VEST);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  // --- Blueprint roll in right hand ---
  fillRect(g, 48, 30, 3, 12, "#d0e0f0"); // rolled blueprint
  fillRect(g, 48, 29, 3, 2, "#a0b0c0");  // end cap
  fillRect(g, 48, 41, 3, 2, "#a0b0c0");  // end cap

  // --- Belt ---
  fillRect(g, 20, 41, 24, 2, "#4a5560");
  fillRect(g, 30, 41, 4, 2, "#d4a843");

  // --- Legs (gray work pants) ---
  const PANTS = "#4a5560";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  // --- Boots ---
  fillRect(g, 20, 55, 12, 3, "#5a4030");
  fillRect(g, 32, 55, 12, 3, "#5a4030");

  return g;
}

function buildVault(): PixelGrid {
  const g = createGrid();

  // --- Hair ---
  fillRect(g, 23, 3, 18, 4, HAIR_BLACK);
  fillRect(g, 21, 5, 22, 2, HAIR_BLACK);

  // --- Goggles on forehead ---
  const GOGGLE_FRAME = "#555";
  const GOGGLE_LENS = "#55aaee";
  fillRect(g, 22, 5, 7, 3, GOGGLE_FRAME);
  fillRect(g, 35, 5, 7, 3, GOGGLE_FRAME);
  fillRect(g, 23, 6, 5, 1, GOGGLE_LENS);
  fillRect(g, 36, 6, 5, 1, GOGGLE_LENS);
  // Strap
  fillRect(g, 29, 6, 6, 1, "#888");

  // --- Head ---
  fillEllipse(g, 32, 13, 11, 7, SKIN);

  // --- Eyes ---
  fillRect(g, 26, 11, 3, 2, EYE_BLACK);
  fillRect(g, 35, 11, 3, 2, EYE_BLACK);
  fillRect(g, 25, 9, 5, 1, HAIR_BLACK);
  fillRect(g, 34, 9, 5, 1, HAIR_BLACK);

  // --- Nose ---
  fillRect(g, 31, 14, 2, 2, SKIN_SHADOW);

  // --- Mouth ---
  fillRect(g, 29, 17, 6, 1, "#cc8866");

  // --- Neck ---
  fillRect(g, 29, 20, 6, 3, SKIN);

  // --- Dark green coveralls ---
  const COVER = "#2a5a3a";
  const COVER_DARK = "#1a3a2a";
  fillRect(g, 18, 23, 28, 4, COVER);
  fillRect(g, 20, 27, 24, 14, COVER);
  // Pockets
  fillRect(g, 22, 30, 6, 4, COVER_DARK);
  fillRect(g, 36, 30, 6, 4, COVER_DARK);
  // Zipper line
  vLine(g, 32, 23, 18, "#888");

  // --- Arms ---
  fillRect(g, 14, 24, 4, 14, COVER);
  fillRect(g, 46, 24, 4, 14, COVER);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  // --- Key chain on belt ---
  const KEY_GOLD = "#ffd700";
  fillRect(g, 20, 41, 24, 2, COVER_DARK);
  // Keys hanging from right hip
  fillRect(g, 42, 42, 2, 3, "#888");  // chain
  fillRect(g, 41, 45, 4, 2, KEY_GOLD); // key 1
  fillRect(g, 43, 44, 2, 3, KEY_GOLD); // key 2
  setPixel(g, 40, 46, KEY_GOLD);       // key 3

  // --- Legs ---
  const PANTS = "#1a3a2a";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  // --- Boots ---
  fillRect(g, 20, 55, 12, 3, "#3a3a2a");
  fillRect(g, 32, 55, 12, 3, "#3a3a2a");

  return g;
}

function buildForge(): PixelGrid {
  const g = createGrid();

  // --- Hair (short black) ---
  fillRect(g, 22, 2, 20, 5, HAIR_BLACK);
  fillRect(g, 20, 4, 24, 3, HAIR_BLACK);

  // --- Head ---
  fillEllipse(g, 32, 13, 11, 8, SKIN);

  // --- Eyes ---
  fillRect(g, 26, 11, 3, 2, EYE_BLACK);
  fillRect(g, 35, 11, 3, 2, EYE_BLACK);
  fillRect(g, 25, 9, 5, 1, HAIR_BLACK);
  fillRect(g, 34, 9, 5, 1, HAIR_BLACK);

  // --- Nose ---
  fillRect(g, 31, 14, 2, 2, SKIN_SHADOW);

  // --- Mouth (focused) ---
  fillRect(g, 29, 17, 6, 1, "#cc8866");

  // --- Neck ---
  fillRect(g, 29, 20, 6, 3, SKIN);

  // --- Black shirt ---
  const SHIRT = "#2a2a2a";
  fillRect(g, 18, 23, 28, 4, SHIRT);
  fillRect(g, 20, 27, 24, 14, SHIRT);

  // --- Red apron ---
  const APRON = "#cc3333";
  const APRON_DARK = "#aa2222";
  fillRect(g, 24, 26, 16, 15, APRON);
  // Apron top strap
  fillRect(g, 28, 24, 2, 2, APRON_DARK);
  fillRect(g, 34, 24, 2, 2, APRON_DARK);
  // Apron pocket
  fillRect(g, 28, 34, 8, 4, APRON_DARK);

  // --- Arms ---
  fillRect(g, 14, 24, 4, 14, SHIRT);
  fillRect(g, 46, 24, 4, 14, SHIRT);
  fillRect(g, 14, 38, 4, 3, SKIN);
  fillRect(g, 46, 38, 4, 3, SKIN);

  // --- Hammer in left hand (T-shape) ---
  // Handle
  fillRect(g, 11, 30, 2, 12, "#8b6535");
  // Head (silver)
  fillRect(g, 8, 28, 8, 3, "#c0c0c0");
  fillRect(g, 9, 27, 6, 1, "#a0a8b4");

  // --- Belt ---
  fillRect(g, 20, 41, 24, 2, "#444");
  fillRect(g, 30, 41, 4, 2, "#888");

  // --- Legs ---
  const PANTS = "#333";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  // --- Boots ---
  fillRect(g, 20, 55, 12, 3, SHOE_BLACK);
  fillRect(g, 32, 55, 12, 3, SHOE_BLACK);

  return g;
}

function buildLens(): PixelGrid {
  const g = createGrid();

  // --- Hair ---
  fillRect(g, 22, 2, 20, 5, "#5a4030");
  fillRect(g, 20, 4, 24, 3, "#5a4030");

  // --- Head ---
  fillEllipse(g, 32, 13, 11, 8, SKIN);

  // --- Light blue glasses ---
  const GLASS = "#88bbee";
  const FRAME = "#6699cc";
  fillRect(g, 24, 10, 6, 4, FRAME);
  fillRect(g, 25, 11, 4, 2, GLASS);
  fillRect(g, 34, 10, 6, 4, FRAME);
  fillRect(g, 35, 11, 4, 2, GLASS);
  fillRect(g, 30, 11, 4, 1, FRAME);

  // --- Eyes ---
  fillRect(g, 26, 11, 2, 2, EYE_BLACK);
  fillRect(g, 36, 11, 2, 2, EYE_BLACK);
  fillRect(g, 25, 9, 5, 1, "#5a4030");
  fillRect(g, 34, 9, 5, 1, "#5a4030");

  // --- Nose ---
  fillRect(g, 31, 14, 2, 2, SKIN_SHADOW);

  // --- Mouth ---
  fillRect(g, 29, 17, 6, 1, "#cc8866");

  // --- Neck ---
  fillRect(g, 29, 20, 6, 3, SKIN);

  // --- White lab coat ---
  const COAT = "#f0f0f0";
  const COAT_SHADOW = "#d8d8d8";
  fillRect(g, 16, 23, 32, 4, COAT);
  fillRect(g, 18, 27, 28, 14, COAT);
  // Coat collar
  fillRect(g, 18, 23, 4, 3, COAT_SHADOW);
  fillRect(g, 42, 23, 4, 3, COAT_SHADOW);
  // Lapel lines
  vLine(g, 22, 23, 18, COAT_SHADOW);
  vLine(g, 42, 23, 18, COAT_SHADOW);
  // Inner shirt (light blue)
  fillRect(g, 28, 24, 8, 6, "#d0e8ff");

  // --- Breast pocket with pen ---
  fillRect(g, 24, 27, 5, 4, COAT_SHADOW);
  fillRect(g, 25, 26, 1, 3, "#2255aa"); // pen (blue)
  setPixel(g, 25, 25, "#d4a843");       // pen clip (gold)

  // --- Arms ---
  fillRect(g, 12, 24, 4, 14, COAT);
  fillRect(g, 48, 24, 4, 14, COAT);
  fillRect(g, 12, 38, 4, 3, SKIN);
  fillRect(g, 48, 38, 4, 3, SKIN);

  // --- Small magnifying glass in right hand ---
  fillRect(g, 50, 36, 2, 6, "#a0a8b4");  // handle
  fillCircle(g, 51, 33, 3, "#a0a8b4");   // frame
  fillCircle(g, 51, 33, 2, "#aaddff");   // lens

  // --- Legs (gray slacks) ---
  const PANTS = "#555";
  fillRect(g, 22, 43, 8, 12, PANTS);
  fillRect(g, 34, 43, 8, 12, PANTS);

  // --- Shoes ---
  fillRect(g, 20, 55, 12, 3, SHOE_BLACK);
  fillRect(g, 32, 55, 12, 3, SHOE_BLACK);

  return g;
}

function buildWaffles(): PixelGrid {
  const g = createGrid();

  // Waffles is shorter — corgi side view, ~40px tall, centered vertically
  const BASE_Y = 24; // offset to push down so it aligns with desk level

  const ORANGE = "#e8a030";
  const ORANGE_DARK = "#c88020";
  const BELLY_WHITE = "#fff8e8";

  // --- Ears (large triangular) ---
  // Left ear
  fillRect(g, 22, BASE_Y, 5, 2, ORANGE_DARK);
  fillRect(g, 23, BASE_Y + 2, 4, 2, ORANGE);
  fillRect(g, 24, BASE_Y + 4, 3, 2, ORANGE);
  fillRect(g, 25, BASE_Y + 6, 2, 1, ORANGE);
  // Right ear
  fillRect(g, 32, BASE_Y, 5, 2, ORANGE_DARK);
  fillRect(g, 33, BASE_Y + 2, 4, 2, ORANGE);
  fillRect(g, 34, BASE_Y + 4, 3, 2, ORANGE);
  fillRect(g, 35, BASE_Y + 6, 2, 1, ORANGE);

  // --- Head ---
  fillEllipse(g, 30, BASE_Y + 11, 10, 5, ORANGE);
  // White face mask
  fillEllipse(g, 30, BASE_Y + 12, 6, 4, BELLY_WHITE);

  // --- Eyes ---
  fillRect(g, 26, BASE_Y + 10, 2, 2, EYE_BLACK);
  fillRect(g, 33, BASE_Y + 10, 2, 2, EYE_BLACK);
  // Eye shine
  setPixel(g, 26, BASE_Y + 10, "#555");
  setPixel(g, 33, BASE_Y + 10, "#555");

  // --- Nose ---
  fillRect(g, 29, BASE_Y + 13, 3, 2, EYE_BLACK);

  // --- Tongue ---
  fillRect(g, 30, BASE_Y + 15, 2, 2, "#ff8888");

  // --- Body (long corgi body) ---
  fillEllipse(g, 30, BASE_Y + 24, 12, 7, ORANGE);
  // Belly
  fillEllipse(g, 30, BASE_Y + 26, 10, 4, BELLY_WHITE);

  // --- Short legs (corgi!) ---
  fillRect(g, 20, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(g, 24, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(g, 34, BASE_Y + 29, 4, 6, ORANGE_DARK);
  fillRect(g, 38, BASE_Y + 29, 4, 6, ORANGE_DARK);
  // Paws
  fillRect(g, 20, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(g, 24, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(g, 34, BASE_Y + 35, 4, 2, BELLY_WHITE);
  fillRect(g, 38, BASE_Y + 35, 4, 2, BELLY_WHITE);

  // --- Tail (curled up) ---
  fillRect(g, 40, BASE_Y + 19, 3, 2, ORANGE);
  fillRect(g, 42, BASE_Y + 17, 3, 3, ORANGE);
  fillRect(g, 44, BASE_Y + 16, 2, 2, ORANGE);

  return g;
}

// ============================================================
// Character registry
// ============================================================

const characterBuilders: Record<string, () => PixelGrid> = {
  boss: buildBoss,
  secretary: buildSecretary,
  sherlock: buildSherlock,
  lego: buildLego,
  vault: buildVault,
  forge: buildForge,
  lens: buildLens,
  waffles: buildWaffles,
};

// Cache built grids so we don't rebuild every render
const gridCache = new Map<string, { x: number; y: number; w: number; h: number; color: string }[]>();

function getOptimizedRects(characterId: string) {
  if (gridCache.has(characterId)) return gridCache.get(characterId)!;
  const builder = characterBuilders[characterId] || buildSecretary;
  const grid = builder();
  const pixels = gridToRects(grid);
  const rects = optimizeRects(pixels);
  gridCache.set(characterId, rects);
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
  onClick?: () => void;
  isWagging?: boolean;
}

export default function PixelCharacterSVG({
  member,
  onClick,
  isWagging = false,
}: PixelCharacterSVGProps) {
  const rects = getOptimizedRects(member.id);
  const animClass =
    member.id === "waffles" && isWagging
      ? "animate-wag"
      : getStatusAnimation(member.status);

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
