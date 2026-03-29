export interface SpriteFrame { sx: number; sy: number; sw: number; sh: number; }

export const CHAR_SPRITES: Record<string, Record<string, SpriteFrame[]>> = {
  boss: {
    front: [{ sx: 57, sy: 110, sw: 120, sh: 203 }, { sx: 286, sy: 110, sw: 124, sh: 203 }, { sx: 522, sy: 110, sw: 115, sh: 203 }],
    walk: [{ sx: 72, sy: 341, sw: 100, sh: 198 }, { sx: 304, sy: 341, sw: 98, sh: 198 }, { sx: 531, sy: 341, sw: 99, sh: 198 }],
    back: [{ sx: 62, sy: 561, sw: 115, sh: 202 }, { sx: 296, sy: 561, sw: 112, sh: 202 }, { sx: 527, sy: 561, sw: 113, sh: 202 }],
  },
  secretary: {
    front: [{ sx: 766, sy: 111, sw: 117, sh: 202 }, { sx: 997, sy: 111, sw: 118, sh: 202 }, { sx: 1229, sy: 111, sw: 117, sh: 202 }],
    walk: [{ sx: 751, sy: 341, sw: 124, sh: 198 }, { sx: 1001, sy: 341, sw: 115, sh: 198 }, { sx: 1238, sy: 341, sw: 122, sh: 198 }],
    back: [{ sx: 766, sy: 561, sw: 117, sh: 202 }, { sx: 997, sy: 561, sw: 118, sh: 202 }, { sx: 1231, sy: 561, sw: 115, sh: 202 }],
  },
  sherlock: {
    front: [{ sx: 1465, sy: 105, sw: 132, sh: 208 }, { sx: 1694, sy: 105, sw: 132, sh: 208 }, { sx: 1924, sy: 105, sw: 147, sh: 208 }],
    walk: [{ sx: 1448, sy: 335, sw: 149, sh: 204 }, { sx: 1699, sy: 335, sw: 116, sh: 204 }, { sx: 1923, sy: 335, sw: 150, sh: 204 }],
    back: [{ sx: 1465, sy: 557, sw: 129, sh: 206 }, { sx: 1698, sy: 557, sw: 128, sh: 206 }, { sx: 1927, sy: 557, sw: 128, sh: 206 }],
  },
  lego: {
    front: [{ sx: 2169, sy: 102, sw: 125, sh: 211 }, { sx: 2405, sy: 102, sw: 120, sh: 211 }, { sx: 2636, sy: 102, sw: 126, sh: 211 }],
    walk: [{ sx: 2159, sy: 331, sw: 128, sh: 208 }, { sx: 2413, sy: 331, sw: 107, sh: 208 }, { sx: 2644, sy: 331, sw: 127, sh: 208 }],
    back: [{ sx: 2168, sy: 555, sw: 125, sh: 208 }, { sx: 2409, sy: 555, sw: 116, sh: 208 }, { sx: 2640, sy: 555, sw: 123, sh: 208 }],
  },
  vault: {
    front: [{ sx: 62, sy: 879, sw: 115, sh: 202 }, { sx: 296, sy: 879, sw: 115, sh: 202 }, { sx: 525, sy: 879, sw: 115, sh: 202 }],
    walk: [{ sx: 71, sy: 1100, sw: 101, sh: 203 }, { sx: 306, sy: 1100, sw: 99, sh: 203 }, { sx: 530, sy: 1100, sw: 99, sh: 203 }],
    back: [{ sx: 62, sy: 1318, sw: 114, sh: 207 }, { sx: 298, sy: 1318, sw: 113, sh: 207 }, { sx: 525, sy: 1318, sw: 114, sh: 207 }],
  },
  forge: {
    front: [{ sx: 751, sy: 878, sw: 133, sh: 203 }, { sx: 1000, sy: 878, sw: 116, sh: 203 }, { sx: 1230, sy: 878, sw: 131, sh: 203 }],
    walk: [{ sx: 746, sy: 1100, sw: 133, sh: 204 }, { sx: 998, sy: 1100, sw: 114, sh: 204 }, { sx: 1236, sy: 1100, sw: 131, sh: 204 }],
    back: [{ sx: 772, sy: 1318, sw: 110, sh: 207 }, { sx: 997, sy: 1318, sw: 116, sh: 207 }, { sx: 1232, sy: 1318, sw: 114, sh: 207 }],
  },
  lens: {
    front: [{ sx: 1470, sy: 878, sw: 115, sh: 203 }, { sx: 1705, sy: 878, sw: 112, sh: 203 }, { sx: 1935, sy: 878, sw: 115, sh: 203 }],
    walk: [{ sx: 1444, sy: 1100, sw: 136, sh: 204 }, { sx: 1706, sy: 1100, sw: 111, sh: 204 }, { sx: 1939, sy: 1100, sw: 136, sh: 204 }],
    back: [{ sx: 1470, sy: 1317, sw: 115, sh: 208 }, { sx: 1708, sy: 1317, sw: 107, sh: 208 }, { sx: 1936, sy: 1317, sw: 111, sh: 208 }],
  },
  waffles: {
    front: [{ sx: 2177, sy: 899, sw: 112, sh: 170 }, { sx: 2414, sy: 899, sw: 107, sh: 170 }, { sx: 2615, sy: 899, sw: 156, sh: 170 }],
    walk: [{ sx: 2167, sy: 1116, sw: 155, sh: 182 }, { sx: 2399, sy: 1116, sw: 141, sh: 182 }, { sx: 2615, sy: 1116, sw: 153, sh: 182 }],
    back: [{ sx: 2177, sy: 1340, sw: 112, sh: 184 }, { sx: 2387, sy: 1340, sw: 143, sh: 184 }, { sx: 2641, sy: 1340, sw: 108, sh: 184 }],
  },
};

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
