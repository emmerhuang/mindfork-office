export interface SpriteFrame { sx: number; sy: number; sw: number; sh: number; }

// ────────────────────────────────────────────────────────────
// V2 individual PNG sprites (180x180 each)
// Structure: /sprites/v2/{char}/{dir}.png, walk-{dir}-{frame}.png, celebrate-south-{frame}.png
// ────────────────────────────────────────────────────────────

export const PIXELLAB_CHARACTERS = new Set(["boss", "secretary", "sherlock", "lego", "vault", "forge", "lens", "waffles", "grant", "mika", "yuki"]);

/** Frame size for v2 individual PNGs */
export const V2_FRAME_SIZE = 180;

/** Directions available */
export const V2_DIRS = ["south", "east", "north", "west"] as const;
const WALK_FRAMES_PER_DIR = 4;

// ── Image key helpers (return the key used in the image map) ──

/** Get idle direction image key: "v2-{charId}-{dir}" */
export function getIdleKey(charId: string, dir: string): string {
  const d = V2_DIRS.includes(dir as typeof V2_DIRS[number]) ? dir : "south";
  return `v2-${charId}-${d}`;
}

/** Get walk animation image key: "v2-{charId}-walk-{dir}-{frame}" */
export function getWalkKey(charId: string, dir: string, frameIdx: number): string {
  const d = V2_DIRS.includes(dir as typeof V2_DIRS[number]) ? dir : "south";
  const fi = frameIdx % WALK_FRAMES_PER_DIR;
  return `v2-${charId}-walk-${d}-${fi}`;
}

/** Get celebrate animation image key: "v2-{charId}-celebrate-{frame}" (south only) */
export function getCelebrateKey(charId: string, frameIdx: number): string {
  const total = CELEBRATE_FRAME_COUNTS[charId] ?? 4;
  const fi = frameIdx % total;
  return `v2-${charId}-celebrate-south-${fi}`;
}

// ────────────────────────────────────────────────────────────
// Celebrate animation: 4 frames per character (south only)
// ────────────────────────────────────────────────────────────

export const CELEBRATE_FRAME_COUNTS: Record<string, number> = {
  boss: 4,
  secretary: 4,
  sherlock: 4,
  lego: 4,
  vault: 4,
  forge: 4,
  lens: 4,
  waffles: 4,
  mika: 7,
  yuki: 7,
};

// ────────────────────────────────────────────────────────────
// Waffles extra animations (still using old sprite sheet format)
// bark: waffles-bark.png (3072x128, 6f x 4dirs)
// idle: waffles-idle.png (4096x128, 8f x 4dirs)
// running: waffles-running.png (2048x128, 4f x 4dirs)
// sneaking: waffles-sneaking.png (4096x128, 8f x 4dirs)
// ────────────────────────────────────────────────────────────

export type WafflesAnim = "walk" | "bark" | "idle" | "running" | "sneaking";

const WAFFLES_ANIM_FRAMES: Record<WafflesAnim, number> = {
  walk: 4,
  bark: 6,
  idle: 8,
  running: 4,
  sneaking: 8,
};

/** Legacy PixelLabFrame for Waffles extra animations (old sprite sheet format, 128x128) */
export interface PixelLabFrame { sx: number; sy: number; sw: 128; sh: 128; }

/** Get Waffles animation frame from old sprite sheet */
export function getWafflesFrame(anim: WafflesAnim, dir: string, frameIdx: number): PixelLabFrame {
  const dirIndex = V2_DIRS.indexOf(dir as typeof V2_DIRS[number]);
  const di = dirIndex >= 0 ? dirIndex : 0;
  const framesPerDir = WAFFLES_ANIM_FRAMES[anim];
  const fi = frameIdx % framesPerDir;
  return {
    sx: (di * framesPerDir + fi) * 128,
    sy: 0,
    sw: 128,
    sh: 128,
  };
}

export { WAFFLES_ANIM_FRAMES };

// ────────────────────────────────────────────────────────────
// Gemini characters: atlas from characters-clean.png (unchanged)
// ────────────────────────────────────────────────────────────

// Gemini atlas entries — kept for any characters not yet migrated to PixelLab
export const CHAR_SPRITES: Record<string, Record<string, SpriteFrame[]>> = {};

// ────────────────────────────────────────────────────────────
// Tileset sprite atlas (tileset-clean.png 2816x1536, 2x resolution)
// ────────────────────────────────────────────────────────────

export const TILE_SPRITES: Record<string, SpriteFrame> = {
  // Band 0 — Floors
  floor_blue:       { sx: 0,    sy: 0,   sw: 329, sh: 376 },
  floor_darkblue:   { sx: 376,  sy: 0,   sw: 305, sh: 376 },
  floor_wood:       { sx: 728,  sy: 0,   sw: 282, sh: 376 },
  floor_yellow:     { sx: 1056, sy: 0,   sw: 329, sh: 376 },
  floor_purple:     { sx: 1431, sy: 0,   sw: 329, sh: 376 },
  floor_brick:      { sx: 1807, sy: 0,   sw: 330, sh: 376 },

  // Band 2 — Walls (green wall segments with decorations)
  wall_plain:       { sx: 0,    sy: 422, sw: 329, sh: 343 },
  wall_window:      { sx: 376,  sy: 422, sw: 305, sh: 343 },
  wall_plain_alt:   { sx: 727,  sy: 422, sw: 283, sh: 342 },
  wall_bookshelf:   { sx: 1056, sy: 422, sw: 330, sh: 352 },
  wall_clock:       { sx: 1431, sy: 422, sw: 329, sh: 343 },
  wall_whiteboard:  { sx: 1806, sy: 422, sw: 330, sh: 343 },
  wall_door:        { sx: 2182, sy: 422, sw: 259, sh: 345 },

  // Band 3 — Furniture
  desk_monitor:     { sx: 41,   sy: 852,  sw: 294, sh: 279 },
  desk_laptop:      { sx: 399,  sy: 886,  sw: 294, sh: 245 },
  office_chair:     { sx: 816,  sy: 891,  sw: 155, sh: 236 },
  meeting_chair_l:  { sx: 1190, sy: 925,  sw: 89,  sh: 154 },
  conference_table: { sx: 1431, sy: 842,  sw: 330, sh: 326 },
  meeting_chair_r:  { sx: 1901, sy: 925,  sw: 87,  sh: 154 },
  filing_cabinet:   { sx: 2205, sy: 837,  sw: 166, sh: 291 },
  dog_bed:          { sx: 2476, sy: 938,  sw: 216, sh: 147 },
  dog_bowl:         { sx: 2703, sy: 985,  sw: 105, sh: 84  },

  // Band 4 — Equipment
  coffee_machine:   { sx: 82,   sy: 1230, sw: 184, sh: 257 },
  water_cooler:     { sx: 456,  sy: 1208, sw: 139, sh: 293 },
  microwave:        { sx: 762,  sy: 1266, sw: 235, sh: 194 },
  fridge:           { sx: 1131, sy: 1202, sw: 202, sh: 300 },
  plant_small:      { sx: 1524, sy: 1307, sw: 123, sh: 94  },
  plant_tall:       { sx: 1833, sy: 1225, sw: 195, sh: 264 },
  window_panel:     { sx: 2135, sy: 1200, sw: 306, sh: 295 },
  carpet:           { sx: 2487, sy: 1232, sw: 306, sh: 244 },
};
