export interface SpriteFrame { sx: number; sy: number; sw: number; sh: number; }

// ────────────────────────────────────────────────────────────
// PixelLab characters: individual sprite sheets (512x128, 4 directions)
// Layout: south(0) | east(128) | north(256) | west(384), each 128x128
// ────────────────────────────────────────────────────────────

export const PIXELLAB_CHARACTERS = new Set(["boss", "secretary", "sherlock", "lego", "vault", "forge", "lens", "waffles"]);

export interface PixelLabFrame { sx: number; sy: number; sw: 128; sh: 128; }

export const PIXELLAB_DIRS: Record<string, PixelLabFrame> = {
  south: { sx: 0,   sy: 0, sw: 128, sh: 128 },
  east:  { sx: 128, sy: 0, sw: 128, sh: 128 },
  north: { sx: 256, sy: 0, sw: 128, sh: 128 },
  west:  { sx: 384, sy: 0, sw: 128, sh: 128 },
};

// ────────────────────────────────────────────────────────────
// Walking animation: {name}-walk.png (2048x128)
// Layout: [south_f0..f3 | east_f0..f3 | north_f0..f3 | west_f0..f3]
// 16 frames, each 128x128
// ────────────────────────────────────────────────────────────

const WALK_DIRS = ["south", "east", "north", "west"] as const;
const WALK_FRAMES_PER_DIR = 4;

/** Get walking animation frame for a given direction and frame index */
export function getWalkFrame(dir: string, frameIdx: number): PixelLabFrame {
  const dirIndex = WALK_DIRS.indexOf(dir as typeof WALK_DIRS[number]);
  const di = dirIndex >= 0 ? dirIndex : 0; // fallback to south
  const fi = frameIdx % WALK_FRAMES_PER_DIR;
  return {
    sx: (di * WALK_FRAMES_PER_DIR + fi) * 128,
    sy: 0,
    sw: 128,
    sh: 128,
  };
}

// ────────────────────────────────────────────────────────────
// Celebrate animation: {name}-celebrate.png (Nx128, south only)
// Variable frame counts per character
// ────────────────────────────────────────────────────────────

export const CELEBRATE_FRAME_COUNTS: Record<string, number> = {
  boss: 6,
  secretary: 7,
  sherlock: 10,
  lego: 7,
  vault: 9,
  forge: 6,
  lens: 8,
  waffles: 8,
};

/** Get celebrate animation frame (south only) */
export function getCelebrateFrame(charId: string, frameIdx: number): PixelLabFrame {
  const total = CELEBRATE_FRAME_COUNTS[charId] ?? 6;
  const fi = frameIdx % total;
  return { sx: fi * 128, sy: 0, sw: 128, sh: 128 };
}

// ────────────────────────────────────────────────────────────
// Waffles extra animations
// ────────────────────────────────────────────────────────────

// bark: waffles-bark.png (3072x128, 6f x 4dirs)
// idle: waffles-idle.png (4096x128, 8f x 4dirs)
// running: waffles-running.png (2048x128, 4f x 4dirs)
// sneaking: waffles-sneaking.png (4096x128, 8f x 4dirs)

export type WafflesAnim = "walk" | "bark" | "idle" | "running" | "sneaking";

const WAFFLES_ANIM_FRAMES: Record<WafflesAnim, number> = {
  walk: 4,
  bark: 6,
  idle: 8,
  running: 4,
  sneaking: 8,
};

/** Get Waffles animation frame for any of its special animations */
export function getWafflesFrame(anim: WafflesAnim, dir: string, frameIdx: number): PixelLabFrame {
  const dirIndex = WALK_DIRS.indexOf(dir as typeof WALK_DIRS[number]);
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
