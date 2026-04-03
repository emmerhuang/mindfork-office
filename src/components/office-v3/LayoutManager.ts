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
}

const STORAGE_KEY = "mindfork-office-layout";

// ── Load / Save ──────────────────────────────────────────────

/** Load layout: Turso API first, then fallback to default.json.
 *  Applies roomConfig to update ROOMS geometry if present. */
export async function loadLayout(): Promise<OfficeLayout> {
  let layout: OfficeLayout | null = null;

  // Try Turso API
  try {
    const resp = await fetch("/api/layout");
    if (resp.ok) {
      const data = await resp.json();
      if (data.layout && data.layout.version && data.layout.objects?.length) {
        layout = data.layout as OfficeLayout;
      }
    }
  } catch { /* Turso unavailable, fallback */ }

  // Fallback: fetch default.json
  if (!layout) {
    const resp = await fetch("/layout/default.json");
    if (!resp.ok) throw new Error(`Failed to load default layout: ${resp.status}`);
    layout = await resp.json();
  }

  // Apply room boundary config
  if (layout!.roomConfig) {
    updateRooms(layout!.roomConfig.wallRows ?? 3, layout!.roomConfig.workRows, layout!.roomConfig.tearoomCols);
  }

  return layout!;
}

/** Save layout to localStorage (local backup) + Turso API (shared persistence) */
export async function saveLayout(layout: OfficeLayout, password?: string): Promise<{ ok: boolean; error?: string }> {
  // Always save locally as backup
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));

  // Sync to Turso if password provided
  if (password) {
    try {
      const resp = await fetch("/api/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout, password }),
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

  return { ok: true };
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
