// TileRenderer.ts — 靜態場景預渲染（地板、牆面、家具、茶水間、會議室）

import { TILE, CANVAS_W, CANVAS_H, CHARACTERS, ROOMS } from "./officeData";
import { TILE_SPRITES, SpriteFrame } from "./spriteAtlas";

const tx = (c: number) => c * TILE;
const ty = (r: number) => r * TILE;

// ── Map Object PNG 快取 ─────────────────────────────────
const MAP_OBJ_NAMES = [
  // 地板 tiles
  "floor-blue", "floor-wood", "floor-purple",
  // 牆面
  "wall-bookshelf", "wall-window", "wall-whiteboard", "wall-clock",
  // 桌子
  "desk-monitor", "desk-laptop", "dog-bed",
  // 茶水間
  "fridge", "water-cooler", "coffee-machine", "cafe-table",
  "vending-machine", "trash-can",
  // 會議室
  "conference-table", "projector-screen",
  // Emotes
  "emote-0", "emote-1", "emote-2", "emote-3", "emote-4", "emote-5",
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

// ── 牆面 ──────────────────────────────────────────────────

function drawWalls(ctx: CanvasRenderingContext2D, _img: HTMLImageElement | null) {
  const wallH = TILE * 3;  // 192px
  const segW = TILE * 2;   // 128px
  const segNames = [
    "wall-bookshelf", "wall-window",
    "wall-whiteboard", "wall-clock",
    "wall-window", "wall-bookshelf",
  ];
  let anyDrawn = false;
  for (let i = 0; i < segNames.length; i++) {
    const wallImg = getMapObj(segNames[i]);
    if (wallImg) {
      if (segNames[i] === "wall-clock") {
        // 時鐘縮小 2/3，居中
        const cw = Math.round(segW * 2 / 3);
        const ch = Math.round(wallH * 2 / 3);
        const cx = i * segW + (segW - cw) / 2;
        const cy = (wallH - ch) / 2;
        ctx.drawImage(wallImg, cx, cy, cw, ch);
      } else {
        ctx.drawImage(wallImg, i * segW, 0, segW + 1, wallH);
      }
      anyDrawn = true;
    }
  }
  if (!anyDrawn) {
    ctx.fillStyle = "#2D5A27";
    ctx.fillRect(0, 0, CANVAS_W, wallH);
    ctx.fillStyle = "#3A7233";
    ctx.fillRect(0, wallH - 4, CANVAS_W, 4);
  }
  // 踢腳板
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, ty(3), CANVAS_W, 3);
}

// ── 桌子 ──────────────────────────────────────────────────

function drawDesks(ctx: CanvasRenderingContext2D, _img: HTMLImageElement | null) {
  let idx = 0;
  for (const ch of CHARACTERS) {
    const x = tx(ch.deskTile.x);
    const y = ty(ch.deskTile.y);
    const dw = TILE * 3;    // 192px (1.5x)
    const dh = TILE * 1.5;  // 96px (1.5x)
    // 居中：從 deskTile 往左上偏移，讓桌子中心對齊原始 2-tile 位置
    const dx = x - TILE / 2;
    const dy = y - TILE / 4;

    if (ch.isWaffles) {
      const bedImg = getMapObj("dog-bed");
      if (bedImg) {
        ctx.drawImage(bedImg, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = "#D68910";
        ctx.beginPath(); ctx.ellipse(dx + dw / 2, dy + dh / 2, dw / 2 - 2, dh / 2 - 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#F39C12";
        ctx.beginPath(); ctx.ellipse(dx + dw / 2, dy + dh / 2, dw / 2 - 5, dh / 2 - 5, 0, 0, Math.PI * 2); ctx.fill();
      }
      continue;
    }

    const pngName = "desk-laptop";
    const deskImg = getMapObj(pngName);
    if (deskImg) {
      ctx.drawImage(deskImg, dx, dy, dw, dh);
      idx++;
    } else {
      ctx.fillStyle = "#C4A87A";
      ctx.fillRect(x, y, dw, dh);
      ctx.fillStyle = "#A0825A";
      ctx.fillRect(x, y + dh - 4, dw, 4);
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(x + dw / 2 - 7, y + 4, 14, 10);
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

// ── 茶水間設備 ────────────────────────────────────────────

function drawTearoom(ctx: CanvasRenderingContext2D) {
  const bx = tx(ROOMS.tearoom.x);
  const by = ty(ROOMS.tearoom.y);   // row 17
  const S = 1.5;

  // ── 左上角：販賣機 (96×160 × 1.2) ──
  const VS = 1.2;
  const vending = getMapObj("vending-machine");
  if (vending) {
    ctx.drawImage(vending, bx + 2, by - 130, 96 * VS, 160 * VS);
  } else {
    ctx.fillStyle = "#CC6644";
    ctx.fillRect(bx + 2, by - 130, 96 * VS, 160 * VS);
  }

  // ── 左上角：飲水機 (64×128 × 1.8) 在販賣機右邊 ──
  const FS = 1.8;
  const waterCooler = getMapObj("water-cooler");
  if (waterCooler) {
    ctx.drawImage(waterCooler, bx + 122, by - 120, 64 * FS, 128 * FS);
  } else {
    ctx.fillStyle = "#88AACC";
    ctx.fillRect(bx + 122, by - 120, 64 * FS, 128 * FS);
  }

  // ── 左上角：咖啡機 (96×128 × 1.5) 在飲水機右邊 ──
  const coffee = getMapObj("coffee-machine");
  if (coffee) {
    ctx.drawImage(coffee, bx + 240, by - 80, 96 * S, 128 * S);
  } else {
    ctx.fillStyle = "#996644";
    ctx.fillRect(bx + 240, by - 80, 96 * S, 128 * S);
  }

  // ── 右上角：冰箱 (96×160 × 1.8) ──
  const fridge = getMapObj("fridge");
  if (fridge) {
    const fridgeX = bx + ROOMS.tearoom.w * TILE - 96 * FS - 4;
    ctx.drawImage(fridge, fridgeX, by - 130, 96 * FS, 160 * FS);
  } else {
    ctx.fillStyle = "#AABBCC";
    ctx.fillRect(bx + ROOMS.tearoom.w * TILE - 96 * FS - 4, by - 130, 96 * FS, 160 * FS);
  }

  // ── 置中：咖啡桌 (128×96 × 1.5 = 192×144) ──
  const cafeTable = getMapObj("cafe-table");
  if (cafeTable) {
    const areaW = ROOMS.tearoom.w * TILE;
    const tableW = 128 * S;
    const tableH = 96 * S;
    const tableX = bx + (areaW - tableW) / 2;
    const tableY = ty(19) + (TILE * 2 - tableH) / 2;
    ctx.drawImage(cafeTable, tableX, tableY, tableW, tableH);
  } else {
    ctx.fillStyle = "#AA8866";
    const areaW = ROOMS.tearoom.w * TILE;
    ctx.fillRect(bx + (areaW - 192) / 2, ty(19) + (TILE * 2 - 144) / 2, 192, 144);
  }

  // ── 垃圾桶 (64×80 × 1.5)，左下角 row 21 ──
  const trashCan = getMapObj("trash-can");
  if (trashCan) {
    ctx.drawImage(trashCan, bx + 8, ty(21) + (TILE - 80), 64 * S, 80 * S);
  } else {
    ctx.fillStyle = "#666666";
    ctx.fillRect(bx + 8, ty(21) + (TILE - 64), 51, 64);
  }
}


// ── 會議室 ────────────────────────────────────────────────

function drawMeetingRoom(ctx: CanvasRenderingContext2D) {
  const rm = ROOMS.meetingRoom;
  const rmX = tx(rm.x);    // col 6
  const rmY = ty(rm.y);    // row 17
  const areaW = rm.w * TILE; // 6 * 64 = 384

  // ── 投影幕 (192×96 × 1.2 = 230×115) → 頂部居中 ──
  const projector = getMapObj("projector-screen");
  if (projector) {
    const screenW = TILE * 3.6;  // ~230px
    const screenH = 115;
    const screenX = rmX + (areaW - screenW) / 2;
    ctx.drawImage(projector, screenX, rmY + 2, screenW, screenH);
  } else {
    ctx.fillStyle = "#EEEEEE";
    ctx.fillRect(rmX + (areaW - 288) / 2, rmY + 2, 288, 144);
  }

  // ── 會議桌 (192×128 × 1.32) → 居中 ──
  const confTable = getMapObj("conference-table");
  if (confTable) {
    const tableW = TILE * 3.96;  // ~253px
    const tableH = TILE * 2.64;  // ~169px
    const tableX = rmX + (areaW - tableW) / 2;
    const tableY = ty(18) + (TILE * 3 - tableH) / 2 + 20;
    ctx.drawImage(confTable, tableX, tableY, tableW, tableH);
  } else {
    ctx.fillStyle = "#8B6914";
    ctx.fillRect(rmX + (areaW - 288) / 2, ty(18) + (TILE * 3 - 192) / 2 + 20, 288, 192);
  }
}

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
  const centerY = ty(10) + 400;
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
) {
  ctx.fillStyle = "#888";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawFloor(ctx, tileImg);
  drawWatermark(ctx);
  drawWalls(ctx, tileImg);
  // Post-its removed — whiteboard PNG already includes content
  drawDesks(ctx, tileImg);
  drawPlant(ctx, tileImg);
  drawTearoom(ctx);
  drawMeetingRoom(ctx);
  drawLabels(ctx);
}
