// LayoutManager.ts — Layout 讀寫管理、walkable map 計算

import { TILE, COLS, ROWS } from "./officeData";

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
  category: string;      // "wall" | "desk" | "tearoom" | "meeting" | "decoration"
  special?: string;      // "kickboard" etc. for canvas-drawn specials
}

export interface OfficeLayout {
  version: number;
  floorColors: { work: string; tearoom: string; meetingRoom: string };
  objects: LayoutObject[];
}

const STORAGE_KEY = "mindfork-office-layout";

// ── Load / Save ──────────────────────────────────────────────

/** Load layout: localStorage first, then fetch default.json */
export async function loadLayout(): Promise<OfficeLayout> {
  // Try localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const layout = JSON.parse(stored) as OfficeLayout;
      if (layout.version && layout.objects?.length) return layout;
    }
  } catch { /* ignore parse errors */ }

  // Fetch default
  const resp = await fetch("/layout/default.json");
  if (!resp.ok) throw new Error(`Failed to load default layout: ${resp.status}`);
  return resp.json();
}

/** Save layout to localStorage */
export function saveLayout(layout: OfficeLayout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
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
  for (const obj of layout.objects) {
    if (obj.walkable) continue;

    // Convert pixel bounds to tile bounds
    const tileLeft = Math.floor(obj.x / TILE);
    const tileTop = Math.floor(obj.y / TILE);
    const tileRight = Math.ceil((obj.x + obj.width) / TILE) - 1;
    const tileBottom = Math.ceil((obj.y + obj.height) / TILE) - 1;

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
