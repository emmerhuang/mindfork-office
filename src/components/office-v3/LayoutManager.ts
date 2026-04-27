// LayoutManager.ts — Layout 讀寫管理、walkable map 計算

import { TILE, COLS, ROWS, updateRooms } from "./officeData";
import { getSpriteBounds } from "./TileRenderer";

// ── Types ────────────────────────────────────────────────────

export interface LayoutObject {
  id: string;
  sprite: string;        // map-object name (e.g. "wall-bookshelf"), "" for special objects
  x: number;             // pixel x
  y: number;             // pixel y
  width: number;
  height: number;
  zIndex: number;
  walkable: boolean;
  anchorCharId?: string;
  charOffsetX?: number;  // character offset from desk bottom-center (px)
  charOffsetY?: number;
  category: string;      // "wall" | "desk" | "tearoom" | "meeting" | "decoration" | "text"
  special?: string;      // "kickboard" | "text" etc. for canvas-drawn specials
  text?: string;         // text content (for text blocks)
  fontSize?: number;     // font size in px (for text blocks)
  fontColor?: string;    // color hex or rgba (for text blocks)
  fontFamily?: string;   // CSS font-family (for text blocks)
  /** Phase B P2-3 (2026-04-22): human-readable label shown in the editor
   *  for trigger zones (overrides the default "Dashboard" / "Chat" /
   *  "Hall of Fame" strings). Not used by the runtime. */
  label?: string;
  /** Phase B P2-3 (2026-04-22): when a character steps into this trigger
   *  zone, play a dialogue from the given chat channel id (e.g.
   *  "forge|mika"). null/undefined = no zone-step dialogue. Runtime only
   *  reads this off trigger-* zones; ignored on other objects. */
  dialogueChannel?: string | null;
}

export interface RoomFloor {
  sprite?: string;   // map-object name for tile pattern (e.g. "floor-gray-carpet")
  color: string;     // fallback solid color
}

export interface OfficeLayout {
  version: number;
  floors: { work: RoomFloor; tearoom: RoomFloor; meetingRoom: RoomFloor };
  /** @deprecated Use floors instead */
  floorColors?: { work: string; tearoom: string; meetingRoom: string };
  objects: LayoutObject[];
  /** Room boundary config (workRows default 14, tearoomCols default 6) */
  roomConfig?: { wallRows?: number; workRows: number; tearoomCols: number };
  /** Manual walkable overrides: "row-col" -> true (walkable) / false (blocked) */
  walkableOverrides?: Record<string, boolean>;
}

const STORAGE_KEY = "mindfork-office-layout";

// ── Load / Save ──────────────────────────────────────────────

/** Load layout from Turso API (single source of truth).
 *  Applies roomConfig to update ROOMS geometry if present. */
export async function loadLayout(): Promise<OfficeLayout> {
  const resp = await fetch("/api/layout");
  if (!resp.ok) {
    throw new Error(`Failed to load layout from Turso API: ${resp.status}`);
  }
  const data = await resp.json();
  if (!data.layout || !data.layout.version || !data.layout.objects?.length) {
    throw new Error("Turso returned invalid or empty layout");
  }
  const layout = data.layout as OfficeLayout;

  // Apply room boundary config
  if (layout.roomConfig) {
    updateRooms(layout.roomConfig.wallRows ?? 3, layout.roomConfig.workRows, layout.roomConfig.tearoomCols);
  }

  return layout;
}

/**
 * Save layout to localStorage (local backup) + Turso API (shared persistence).
 *
 * Auth: relies on the httpOnly `mfo_admin` cookie set by /api/admin-auth.
 * Caller must have already authenticated via that endpoint; if the cookie is
 * missing/expired the API returns 403 and we surface the error.
 *
 * If `syncRemote` is false we only persist locally — useful for previews
 * that should never round-trip through Turso.
 */
export async function saveLayout(
  layout: OfficeLayout,
  syncRemote: boolean = true,
): Promise<{ ok: boolean; error?: string }> {
  // Always save locally as backup
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));

  if (!syncRemote) return { ok: true };

  try {
    const resp = await fetch("/api/layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ layout }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      return { ok: false, error: data.error || `HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Clear localStorage layout (revert to default) */
export function clearLayout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Walkable Map ─────────────────────────────────────────────

/** Compute walkable map from layout objects.
 *  Wall rows (0-2) are always blocked. Non-walkable objects block their tile footprint.
 */
export function computeWalkableMap(layout: OfficeLayout): boolean[][] {
  const map: boolean[][] = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      // Wall area always blocked
      map[r][c] = r >= 3;
    }
  }

  // Block tiles covered by non-walkable objects (tight sprite bounds when available)
  const HALF_TILE = TILE / 2; // 48px — thin objects below this threshold don't block tiles
  for (const obj of layout.objects) {
    if (obj.walkable) continue;

    // Use tight sprite bounds if available, otherwise full bounding box
    const bounds = obj.sprite ? getSpriteBounds(obj.sprite) : undefined;

    let blockX: number, blockY: number, blockW: number, blockH: number;

    if (bounds) {
      // Tight bounds from non-transparent pixels
      blockX = obj.x + bounds.ratioLeft * obj.width;
      blockY = obj.y + bounds.ratioTop * obj.height;
      blockW = (bounds.ratioRight - bounds.ratioLeft) * obj.width;
      blockH = (bounds.ratioBottom - bounds.ratioTop) * obj.height;
    } else {
      // No sprite (kickboard etc.): use full object bounds
      blockX = obj.x;
      blockY = obj.y;
      blockW = obj.width;
      blockH = obj.height;
    }

    // Desk objects with anchored characters: only block the top portion (desk surface).
    // The bottom row of tiles is where the character stands and needs to pass through.
    if (obj.anchorCharId) {
      blockH = Math.max(0, blockH - TILE);
    }

    // Skip thin objects: if either dimension is less than half a tile,
    // the object is too thin to meaningfully block movement
    if (blockW < HALF_TILE || blockH < HALF_TILE) continue;

    // Convert pixel bounds to tile bounds
    const tileLeft = Math.floor(blockX / TILE);
    const tileTop = Math.floor(blockY / TILE);
    const tileRight = Math.ceil((blockX + blockW) / TILE) - 1;
    const tileBottom = Math.ceil((blockY + blockH) / TILE) - 1;

    for (let r = tileTop; r <= tileBottom; r++) {
      for (let c = tileLeft; c <= tileRight; c++) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
          map[r][c] = false;
        }
      }
    }
  }

  // Force-unlock anchor character home tiles + ensure exit path:
  // Characters stand at the bottom-center of their desk, which often falls
  // within the desk's blocked tile footprint. Ensure those tiles are walkable,
  // and that at least one adjacent tile is also walkable (so the character
  // can actually leave).
  for (const obj of layout.objects) {
    if (!obj.anchorCharId) continue;
    const ox = obj.charOffsetX ?? 0;
    const oy = obj.charOffsetY ?? 0;
    const homePx = obj.x + obj.width / 2 + ox;
    const homePy = obj.y + obj.height + oy;
    const hCol = Math.floor(homePx / TILE);
    const hRow = Math.floor(homePy / TILE);
    if (hRow >= 0 && hRow < ROWS && hCol >= 0 && hCol < COLS) {
      map[hRow][hCol] = true;

      // Ensure at least one neighbor is walkable (prefer below, then sides, then above)
      const neighbors: Array<[number, number]> = [
        [hRow + 1, hCol],     // below
        [hRow, hCol - 1],     // left
        [hRow, hCol + 1],     // right
        [hRow - 1, hCol],     // above
      ];
      const hasExit = neighbors.some(([nr, nc]) =>
        nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && map[nr][nc]
      );
      if (!hasExit) {
        // Unlock below (most natural exit — character walks away from desk)
        const exitR = hRow + 1;
        if (exitR < ROWS && hCol >= 0 && hCol < COLS) {
          map[exitR][hCol] = true;
        }
      }
    }
  }

  // Apply manual walkable overrides (editor-set per-tile toggles)
  if (layout.walkableOverrides) {
    for (const [key, val] of Object.entries(layout.walkableOverrides)) {
      const [r, c] = key.split('-').map(Number);
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        map[r][c] = val;
      }
    }
  }

  return map;
}

// ── Export ────────────────────────────────────────────────────

/** Export layout as downloadable JSON file */
export function exportLayout(layout: OfficeLayout): void {
  const json = JSON.stringify(layout, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `office-layout-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import layout from JSON file */
export function importLayout(file: File): Promise<OfficeLayout> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const layout = JSON.parse(reader.result as string) as OfficeLayout;
        if (!layout.version || !layout.objects) {
          reject(new Error("Invalid layout file"));
          return;
        }
        resolve(layout);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
