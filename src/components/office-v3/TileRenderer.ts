// TileRenderer.ts — 靜態場景預渲染（地板、牆面、家具、茶水間、會議室）

import { TILE, CANVAS_W, CANVAS_H, CHARACTERS, ROOMS } from "./officeData";
import { TILE_SPRITES, SpriteFrame } from "./spriteAtlas";
import type { OfficeLayout } from "./LayoutManager";

const tx = (c: number) => c * TILE;
const ty = (r: number) => r * TILE;

// ── Map Object PNG 快取 ─────────────────────────────────
export const MAP_OBJ_NAMES = [
  // 地板 tiles (original)
  "floor-blue", "floor-wood", "floor-purple",
  // 地板 tiles (128px)
  "floor-gray-carpet", "floor-honey-wood", "floor-walnut",
  "floor-marble", "floor-beige-wood", "floor-lavender",
  "floor-herringbone", "floor-slate", "floor-terracotta", "floor-bamboo",
  // 牆面
  "wall-bookshelf", "wall-window", "wall-whiteboard", "wall-clock",
  "wall-panoramic-window", "wall-shelf-painting",
  // 桌子 / 辦公室
  "desk-monitor", "desk-laptop", "desk-standing", "dog-bed",
  "sofa-teal", "filing-cabinet", "printer",
  // 茶水間
  "fridge", "fridge-retro", "water-cooler",
  "coffee-machine", "coffee-machine-red",
  "kitchen-counter", "kitchen-cabinet",
  "kitchen-cabinet-south", "kitchen-cabinet-east", "kitchen-cabinet-north", "kitchen-cabinet-west",
  "cafe-table",
  "vending-machine", "trash-can", "bar-table",
  "fruit-bowl", "microwave",
  // 會議室
  "conference-table", "projector-screen",
  // 通用擺設
  "plant-monstera", "plant-cactus", "succulents", "tree-indoor", "table-lamp",
  // Emotes
  "emote-0", "emote-1", "emote-2", "emote-3", "emote-4", "emote-5",
  "emote-6", "emote-7", "emote-8",
] as const;

const mapObjCache: Record<string, HTMLImageElement> = {};

export function getMapObj(name: string): HTMLImageElement | undefined {
  return mapObjCache[name];
}

/** Preload all map-object PNGs. Call once during init, await before renderStaticScene. */
export function preloadMapObjects(): Promise<void> {
  const loads = MAP_OBJ_NAMES.map((name) => {
    if (mapObjCache[name]) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { mapObjCache[name] = img; resolve(); };
      img.onerror = () => { resolve(); }; // graceful: missing PNG → skip
      img.src = `/sprites/map-objects/${name}.png`;
    });
  });
  return Promise.all(loads).then(() => {});
}

function drawSprite(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  s: SpriteFrame, dx: number, dy: number, dw: number, dh: number,
) {
  ctx.drawImage(img, s.sx, s.sy, s.sw, s.sh, dx, dy, dw, dh);
}

// ── 地板 ──────────────────────────────────────────────────

function drawFloor(ctx: CanvasRenderingContext2D, _img: HTMLImageElement | null) {
  const areas: Array<{ r: { x: number; y: number; w: number; h: number }; color: string }> = [
    { r: ROOMS.work,        color: "#D4CFC8" },  // 淺灰米色
    { r: ROOMS.tearoom,     color: "#E8DFC8" },  // 淺米色
    { r: ROOMS.meetingRoom, color: "#D8D0E0" },  // 淺薰衣草
  ];
  for (const { r, color } of areas) {
    ctx.fillStyle = color;
    ctx.fillRect(tx(r.x), ty(r.y), r.w * TILE, r.h * TILE);
  }
}

// ── Layout-based object rendering ─────────────────────────

function drawLayoutObjects(ctx: CanvasRenderingContext2D, layout: OfficeLayout) {
  // Sort by zIndex for correct draw order
  const sorted = [...layout.objects].sort((a, b) => a.zIndex - b.zIndex);
  for (const obj of sorted) {
    // Special: kickboard (canvas-drawn, no sprite)
    if (obj.special === "kickboard") {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      continue;
    }
    // Skip trigger zones (invisible in normal mode, only shown in editor)
    if (obj.category === "trigger") continue;
    // Skip objects with no sprite
    if (!obj.sprite) continue;

    const img = getMapObj(obj.sprite);
    if (img) {
      ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height);
    }
  }
}

// ── 盆栽 ──────────────────────────────────────────────────

function drawPlant(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null) {
  const positions = [{ x: 5, y: 4 }, { x: 6, y: 4 }];
  for (const pos of positions) {
    const px = tx(pos.x);
    const py = ty(pos.y);
    if (img) {
      const s = TILE_SPRITES.plant_tall;
      const dw = TILE * 0.9;
      const dh = Math.round(dw * (s.sh / s.sw));
      drawSprite(ctx, img, s, px + (TILE - dw) / 2, py + TILE - dh, dw, dh);
    } else {
      ctx.fillStyle = "#C0714A";
      ctx.fillRect(px + 20, py + 40, 24, 24);
      ctx.fillStyle = "#2E8B57";
      ctx.beginPath(); ctx.ellipse(px + 32, py + 30, 16, 22, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// (drawTearoom and drawMeetingRoom removed — now rendered via layout objects)

// ── 區域標籤 ──────────────────────────────────────────────

function drawWhiteboardPostIts(ctx: CanvasRenderingContext2D) {
  // 在 whiteboard tile（牆面第3段, x=4*TILE）上畫幾張便利貼
  const wx = TILE * 4 + 15;
  const wy = TILE * 0.8;
  const notes = [
    { x: wx,       y: wy,      w: 30, h: 25, color: "#FFE066" },
    { x: wx + 40,  y: wy + 5,  w: 28, h: 22, color: "#66D9FF" },
    { x: wx + 75,  y: wy - 2,  w: 32, h: 26, color: "#FF9999" },
    { x: wx + 115, y: wy + 3,  w: 27, h: 24, color: "#99FF99" },
    { x: wx + 10,  y: wy + 35, w: 30, h: 22, color: "#FFB366" },
    { x: wx + 50,  y: wy + 32, w: 28, h: 25, color: "#D9B3FF" },
    { x: wx + 90,  y: wy + 38, w: 32, h: 22, color: "#FFFF99" },
  ];
  for (const n of notes) {
    ctx.fillStyle = n.color;
    ctx.fillRect(n.x, n.y, n.w, n.h);
    // 小圖釘
    ctx.fillStyle = "#CC3333";
    ctx.beginPath();
    ctx.arc(n.x + n.w / 2, n.y + 2, 2, 0, Math.PI * 2);
    ctx.fill();
    // 文字線條
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    for (let i = 0; i < 2; i++) {
      ctx.fillRect(n.x + 4, n.y + 8 + i * 7, n.w - 8, 1.5);
    }
  }
}

function drawBulletinBoard(ctx: CanvasRenderingContext2D) {
  // 公告欄 — 在牆面上方 (cols 4-7, rows 1-2)
  const bx = tx(4) + 10;
  const by = ty(1) + 5;
  const bw = TILE * 3.5 - 20;
  const bh = TILE * 1.8;

  // Cork board background
  ctx.fillStyle = "#C4956A";
  ctx.fillRect(bx, by, bw, bh);
  // Border
  ctx.strokeStyle = "#7A5A3A";
  ctx.lineWidth = 3;
  ctx.strokeRect(bx, by, bw, bh);
  // Inner frame
  ctx.strokeStyle = "#A07850";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);

  // Pixel-style post-it notes
  const notes = [
    { x: bx + 10, y: by + 12, w: 50, h: 40, color: "#FFE066" },
    { x: bx + 70, y: by + 8,  w: 55, h: 45, color: "#66D9FF" },
    { x: bx + 135, y: by + 15, w: 48, h: 38, color: "#FF9999" },
    { x: bx + 200, y: by + 10, w: 52, h: 42, color: "#99FF99" },
    { x: bx + 20, y: by + 60, w: 58, h: 40, color: "#FFB366" },
    { x: bx + 90, y: by + 65, w: 50, h: 35, color: "#D9B3FF" },
    { x: bx + 155, y: by + 58, w: 55, h: 42, color: "#FFFF99" },
  ];
  for (const n of notes) {
    ctx.fillStyle = n.color;
    ctx.fillRect(n.x, n.y, n.w, n.h);
    // Tiny pin
    ctx.fillStyle = "#CC3333";
    ctx.beginPath();
    ctx.arc(n.x + n.w / 2, n.y + 3, 3, 0, Math.PI * 2);
    ctx.fill();
    // Squiggly text lines
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(n.x + 6, n.y + 12 + i * 9, n.w - 12, 2);
    }
  }

  // Title
  ctx.save();
  ctx.font = "bold 16px 'Courier New', monospace";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.textAlign = "center";
  ctx.fillText("HALL OF FAME", bx + bw / 2, by + bh + 14);
  ctx.restore();
}

function drawLabels(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillText("茶水間", tx(2), ty(21) + TILE * 0.5);
  ctx.fillText("會議室", tx(8), ty(21) + TILE * 0.5);
  ctx.restore();

  // 房間分隔線
  ctx.strokeStyle = "#999080";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(tx(ROOMS.meetingRoom.x), ty(ROOMS.tearoom.y));
  ctx.lineTo(tx(ROOMS.meetingRoom.x), CANVAS_H);
  ctx.stroke();
  ctx.setLineDash([]);

  // 工作區下邊界
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, ty(ROOMS.tearoom.y));
  ctx.lineTo(CANVAS_W, ty(ROOMS.tearoom.y));
  ctx.stroke();
}

// ── 地板浮水印 ──────────────────────────────────────────────

function drawWatermark(ctx: CanvasRenderingContext2D) {
  ctx.save();
  const centerX = tx(6);
  const centerY = ty(10) + 350;
  ctx.font = "bold 48px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // 彩色文字：逐字上色
  const text = "MindFork Office";
  const colors = ["#E74C3C", "#E67E22", "#F1C40F", "#2ECC71", "#3498DB", "#9B59B6", "#E91E63",
                  "#1ABC9C", "#F39C12", "#2980B9", "#8E44AD", "#E74C3C", "#27AE60", "#3498DB", "#9B59B6"];
  const totalW = ctx.measureText(text).width;
  let x = centerX - totalW / 2;
  for (let i = 0; i < text.length; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.35;
    ctx.fillText(text[i], x, centerY);
    x += ctx.measureText(text[i]).width;
  }
  ctx.globalAlpha = 1.0;
  ctx.restore();
}

// ── 公開 API ──────────────────────────────────────────────

export function renderStaticScene(
  ctx: CanvasRenderingContext2D,
  tileImg: HTMLImageElement | null,
  layout?: OfficeLayout,
) {
  ctx.fillStyle = "#888";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Draw floor using layout colors if available, otherwise defaults
  if (layout) {
    drawFloorFromLayout(ctx, layout);
  } else {
    drawFloor(ctx, tileImg);
  }
  drawWatermark(ctx);

  if (layout) {
    // Layout-based rendering: all walls, desks, tearoom, meeting room objects
    drawLayoutObjects(ctx, layout);
  }

  // Plants and bulletin board are now layout objects
}

/** Draw floor areas using layout-provided floors (sprite pattern or fallback color) */
function drawFloorFromLayout(ctx: CanvasRenderingContext2D, layout: OfficeLayout) {
  // Migrate legacy floorColors to floors
  const floors = layout.floors ?? (layout.floorColors ? {
    work: { color: layout.floorColors.work },
    tearoom: { color: layout.floorColors.tearoom },
    meetingRoom: { color: layout.floorColors.meetingRoom },
  } : {
    work: { color: "#D4CFC8" },
    tearoom: { color: "#E8DFC8" },
    meetingRoom: { color: "#D8D0E0" },
  });

  const areas: Array<{ r: { x: number; y: number; w: number; h: number }; floor: { sprite?: string; color: string } }> = [
    { r: ROOMS.work,        floor: floors.work },
    { r: ROOMS.tearoom,     floor: floors.tearoom },
    { r: ROOMS.meetingRoom, floor: floors.meetingRoom },
  ];

  for (const { r, floor } of areas) {
    const px = tx(r.x);
    const py = ty(r.y);
    const pw = r.w * TILE;
    const ph = r.h * TILE;

    // Try sprite tile pattern first
    if (floor.sprite) {
      const img = getMapObj(floor.sprite);
      if (img) {
        // Clip to room area so tiles don't overflow
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        ctx.clip();
        // Draw each floor tile at its original size
        const tw = img.naturalWidth;
        const th = img.naturalHeight;
        for (let y = 0; y < ph; y += th) {
          for (let x = 0; x < pw; x += tw) {
            ctx.drawImage(img, px + x, py + y, tw, th);
          }
        }
        ctx.restore();
        continue;
      }
    }
    // Fallback: solid color
    ctx.fillStyle = floor.color;
    ctx.fillRect(px, py, pw, ph);
  }
}
