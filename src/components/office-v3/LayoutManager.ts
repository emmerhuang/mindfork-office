// LayoutManager.ts — Layout 讀寫管理、walkable map 計算

import { TILE, COLS, ROWS, updateRooms } from "./officeData";
import { getMapObj } from "./TileRenderer";

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

  // Block tiles covered by non-walkable objects
  // Uses PNG alpha channel when sprite image is available; falls back to bounding box otherwise.
  for (const obj of layout.objects) {
    if (obj.walkable) continue;

    // Convert pixel bounds to tile bounds
    const tileLeft = Math.floor(obj.x / TILE);
    const tileTop = Math.floor(obj.y / TILE);
    const tileRight = Math.ceil((obj.x + obj.width) / TILE) - 1;
    const tileBottom = Math.ceil((obj.y + obj.height) / TILE) - 1;

    // Try alpha-based detection if sprite image is loaded
    const img = obj.sprite ? getMapObj(obj.sprite) : undefined;
    if (img) {
      // Read alpha channel via offscreen canvas (once per object)
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = img.naturalWidth;
      tmpCanvas.height = img.naturalHeight;
      const tmpCtx = tmpCanvas.getContext("2d")!;
      tmpCtx.drawImage(img, 0, 0);
      const imageData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
      const pixels = imageData.data;

      const scaleX = obj.width / img.naturalWidth;
      const scaleY = obj.height / img.naturalHeight;

      for (let r = tileTop; r <= tileBottom; r++) {
        for (let c = tileLeft; c <= tileRight; c++) {
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;

          // Map this tile back to image pixel region
          const imgX0 = Math.floor((c * TILE - obj.x) / scaleX);
          const imgY0 = Math.floor((r * TILE - obj.y) / scaleY);
          const imgX1 = Math.ceil(((c + 1) * TILE - obj.x) / scaleX);
          const imgY1 = Math.ceil(((r + 1) * TILE - obj.y) / scaleY);

          // Check for any opaque pixel (alpha > 128) in the region
          let hasOpaque = false;
          for (let py = Math.max(0, imgY0); py < Math.min(imgY1, tmpCanvas.height); py++) {
            for (let px = Math.max(0, imgX0); px < Math.min(imgX1, tmpCanvas.width); px++) {
              if (pixels[(py * tmpCanvas.width + px) * 4 + 3] > 128) {
                hasOpaque = true;
                break;
              }
            }
            if (hasOpaque) break;
          }

          if (hasOpaque) {
            map[r][c] = false;
          }
        }
      }
    } else {
      // No sprite or image not loaded — fallback to bounding box
      for (let r = tileTop; r <= tileBottom; r++) {
        for (let c = tileLeft; c <= tileRight; c++) {
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
            map[r][c] = false;
          }
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
