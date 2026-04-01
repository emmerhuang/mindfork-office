// TileRenderer.ts — 靜態場景預渲染（地板、牆面、家具、茶水間、會議室）

import { TILE, CANVAS_W, CANVAS_H, CHARACTERS, ROOMS } from "./officeData";
import { TILE_SPRITES, SpriteFrame } from "./spriteAtlas";

const tx = (c: number) => c * TILE;
const ty = (r: number) => r * TILE;

function drawSprite(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  s: SpriteFrame, dx: number, dy: number, dw: number, dh: number,
) {
  ctx.drawImage(img, s.sx, s.sy, s.sw, s.sh, dx, dy, dw, dh);
}

// ── 地板 ──────────────────────────────────────────────────

function drawFloor(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null) {
  const areas: Array<{ r: { x: number; y: number; w: number; h: number }; sprite: SpriteFrame | null; fallback: string }> = [
    { r: ROOMS.work,        sprite: img ? TILE_SPRITES.floor_blue   : null, fallback: "#D4C9B8" },
    { r: ROOMS.tearoom,     sprite: img ? TILE_SPRITES.floor_wood   : null, fallback: "#E8D5A3" },
    { r: ROOMS.meetingRoom, sprite: img ? TILE_SPRITES.floor_purple : null, fallback: "#D4C8E0" },
  ];
  for (const { r, sprite, fallback } of areas) {
    if (sprite && img) {
      for (let row = r.y; row < r.y + r.h; row++)
        for (let col = r.x; col < r.x + r.w; col++)
          drawSprite(ctx, img, sprite, tx(col), ty(row), TILE, TILE);
    } else {
      ctx.fillStyle = fallback;
      ctx.fillRect(tx(r.x), ty(r.y), r.w * TILE, r.h * TILE);
    }
  }
}

// ── 牆面 ──────────────────────────────────────────────────

function drawWalls(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null) {
  const wallH = TILE * 3;
  const segW = TILE * 2;
  if (img) {
    const segs = [
      TILE_SPRITES.wall_bookshelf, TILE_SPRITES.wall_window,
      TILE_SPRITES.wall_whiteboard, TILE_SPRITES.wall_clock,
      TILE_SPRITES.wall_window,    TILE_SPRITES.wall_bookshelf,
    ];
    for (let i = 0; i < segs.length; i++)
      drawSprite(ctx, img, segs[i], i * segW, 0, segW + 1, wallH);
  } else {
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

function drawDesks(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null) {
  let idx = 0;
  for (const ch of CHARACTERS) {
    const x = tx(ch.deskTile.x);
    const y = ty(ch.deskTile.y);
    const dw = TILE * 2;
    const dh = TILE;

    if (ch.isWaffles) {
      if (img) {
        drawSprite(ctx, img, TILE_SPRITES.dog_bed, x, y - 4, dw, dh + 4);
        drawSprite(ctx, img, TILE_SPRITES.dog_bowl, x + dw + 2, y + 4, TILE * 0.8, TILE * 0.5);
      } else {
        ctx.fillStyle = "#D68910";
        ctx.beginPath(); ctx.ellipse(x + dw / 2, y + dh / 2, dw / 2 - 2, dh / 2 - 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#F39C12";
        ctx.beginPath(); ctx.ellipse(x + dw / 2, y + dh / 2, dw / 2 - 5, dh / 2 - 5, 0, 0, Math.PI * 2); ctx.fill();
      }
      continue;
    }

    if (img) {
      const key = idx % 2 === 0 ? "desk_monitor" : "desk_laptop";
      const s = TILE_SPRITES[key];
      const sh = Math.round(dw * (s.sh / s.sw));
      drawSprite(ctx, img, s, x, y + dh - sh, dw, sh);
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
  const px = tx(5);
  const py = ty(4);
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

// ── 茶水間設備 ────────────────────────────────────────────

function drawTearoom(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null) {
  const bx = tx(ROOMS.tearoom.x);
  const by = ty(ROOMS.tearoom.y);   // row 15

  if (img) {
    // ── Row 15: Fridge + Water Cooler + Coffee Machine + Microwave ──
    const fridgeW = TILE * 1.2, fridgeH = TILE * 1.6;
    const waterW = TILE * 0.6, waterH = TILE * 1.2;
    const coffeeW = TILE * 0.5, coffeeH = TILE * 0.8;
    let cx = bx + 4;
    drawSprite(ctx, img, TILE_SPRITES.fridge, cx, by + 4, fridgeW, fridgeH);
    cx += fridgeW + 4;
    drawSprite(ctx, img, TILE_SPRITES.water_cooler, cx, by + 4 + (fridgeH - waterH), waterW, waterH);
    cx += waterW + 4;
    drawSprite(ctx, img, TILE_SPRITES.coffee_machine, cx, by + 4 + (fridgeH - coffeeH), coffeeW, coffeeH);
    // Microwave (col 3, row 15)
    const mwW = TILE * 0.9, mwH = TILE * 0.7;
    drawSprite(ctx, img, TILE_SPRITES.microwave, tx(3) + 4, by + TILE * 0.3, mwW, mwH);

    // ── Snack shelf (col 5, row 15) — pixel art ──
    drawSnackShelf(ctx, tx(5), by);

    // ── Rest table + chairs (cols 1-3, rows 17-18) ──
    drawTearoomTable(ctx, tx(1), ty(17));

    // ── Trash can (col 0, row 19) — pixel art ──
    drawTrashCan(ctx, tx(0) + 20, ty(19) + 10);
  } else {
    // Fallback — simple colored rectangles
    ctx.fillStyle = "#C8D0D8";
    ctx.fillRect(bx, by, TILE * 4, TILE);
    ctx.fillStyle = "#B8946A";
    ctx.fillRect(tx(1), ty(17), TILE * 3, TILE * 1.5);
    ctx.fillStyle = "#8B7355";
    ctx.fillRect(tx(5), by, TILE, TILE * 1.5);
  }
}

// ── 茶水間小桌子（像素風圓桌 + 3 張椅子）──
function drawTearoomTable(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Round table (center of 3-tile area)
  const cx = x + TILE * 1.5;
  const cy = y + TILE * 0.9;
  // Table shadow
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 2, TILE * 0.7, TILE * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  // Table top
  ctx.fillStyle = "#C4A87A";
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE * 0.7, TILE * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#A0825A";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE * 0.7, TILE * 0.45, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Cup on table
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(cx - 8, cy - 10, 16, 12);
  ctx.fillStyle = "#8B4513";
  ctx.fillRect(cx - 6, cy - 8, 12, 8);
  // Handle
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx + 10, cy - 4, 5, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();

  // 3 chairs around table (pixel style stools)
  const chairs = [
    { x: cx - TILE * 1.1, y: cy - 10 },   // left
    { x: cx + TILE * 0.7, y: cy - 10 },    // right
    { x: cx - 20, y: cy + TILE * 0.6 },    // bottom
  ];
  for (const ch of chairs) {
    // Seat
    ctx.fillStyle = "#6B8E6B";
    ctx.fillRect(ch.x, ch.y, 36, 30);
    ctx.fillStyle = "#5A7A5A";
    ctx.fillRect(ch.x + 2, ch.y + 2, 32, 26);
    // Legs (pixel dots)
    ctx.fillStyle = "#4A4A4A";
    ctx.fillRect(ch.x + 2, ch.y + 28, 4, 6);
    ctx.fillRect(ch.x + 30, ch.y + 28, 4, 6);
  }
}

// ── 零食架（像素風 bookshelf style）──
function drawSnackShelf(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const sw = TILE * 0.85, sh = TILE * 1.8;
  // Shelf frame
  ctx.fillStyle = "#8B6914";
  ctx.fillRect(x + 8, y + 8, sw, sh);
  ctx.fillStyle = "#A07828";
  ctx.fillRect(x + 12, y + 12, sw - 8, sh - 8);

  // Shelves (3 horizontal lines)
  ctx.fillStyle = "#8B6914";
  for (let i = 1; i <= 3; i++) {
    ctx.fillRect(x + 10, y + 8 + (sh / 4) * i, sw - 4, 4);
  }

  // Snack items on each shelf (colored rectangles = boxes/bags)
  const snacks = [
    // Shelf 1
    { sx: 16, sy: 16, w: 18, h: 30, color: "#E74C3C" },  // red box
    { sx: 38, sy: 20, w: 16, h: 26, color: "#F39C12" },  // orange bag
    { sx: 58, sy: 18, w: 14, h: 28, color: "#27AE60" },  // green box
    // Shelf 2
    { sx: 16, sy: 56, w: 20, h: 28, color: "#3498DB" },  // blue box
    { sx: 40, sy: 60, w: 16, h: 24, color: "#9B59B6" },  // purple bag
    { sx: 60, sy: 58, w: 14, h: 26, color: "#E67E22" },  // brown box
    // Shelf 3
    { sx: 18, sy: 98, w: 22, h: 26, color: "#1ABC9C" },  // teal
    { sx: 44, sy: 100, w: 18, h: 24, color: "#E91E63" }, // pink
    { sx: 66, sy: 98, w: 12, h: 26, color: "#FFC107" },  // yellow
  ];
  for (const s of snacks) {
    ctx.fillStyle = s.color;
    ctx.fillRect(x + s.sx, y + s.sy, s.w, s.h);
    // Pixel highlight
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(x + s.sx + 2, y + s.sy + 2, s.w - 4, 3);
  }
}

// ── 垃圾桶（像素風）──
function drawTrashCan(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = 48, h = 60;
  // Body
  ctx.fillStyle = "#7F8C8D";
  ctx.fillRect(x, y + 12, w, h - 12);
  // Slight taper (darker sides)
  ctx.fillStyle = "#6C7A7A";
  ctx.fillRect(x, y + 12, 4, h - 12);
  ctx.fillRect(x + w - 4, y + 12, 4, h - 12);
  // Lid
  ctx.fillStyle = "#95A5A6";
  ctx.fillRect(x - 4, y + 6, w + 8, 10);
  // Lid handle
  ctx.fillStyle = "#BDC3C7";
  ctx.fillRect(x + w / 2 - 8, y, 16, 10);
  // Horizontal lines (ridges)
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(x + 4, y + 30, w - 8, 2);
  ctx.fillRect(x + 4, y + 46, w - 8, 2);
}

// ── 會議室 ────────────────────────────────────────────────

function drawMeetingRoom(ctx: CanvasRenderingContext2D, tileImg?: HTMLImageElement | null) {
  const rm = ROOMS.meetingRoom;
  const rmY = ty(rm.y);   // row 15

  // ── Projector screen (row 15, cols 8-10) ──
  drawProjectorScreen(ctx, tx(8), rmY + 8);

  if (tileImg) {
    // ── Conference table (rows 16-18, cols 8-10) ──
    const s = TILE_SPRITES.conference_table;
    if (s) {
      const tableCx = tx(9);
      const tableCy = ty(17) + 40; // 下移 40px
      const dw = TILE * 3.0;
      const dh = TILE * 2.8;
      drawSprite(ctx, tileImg, s, tableCx - dw / 2, tableCy - dh / 2, dw, dh);
    }
  } else {
    const tw = TILE * 3, th = TILE * 2.5;
    const tableCx = tx(9);
    const tableCy = ty(17) + 40;
    ctx.fillStyle = "#B8946A";
    ctx.fillRect(tableCx - tw / 2, tableCy - th / 2, tw, th);
  }
}

// ── 投影布幕（像素風）──
function drawProjectorScreen(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = TILE * 3 - 16, h = TILE * 0.85;
  // Mount bar
  ctx.fillStyle = "#555";
  ctx.fillRect(x + 8, y, w, 6);
  // Screen
  ctx.fillStyle = "#F0F0F0";
  ctx.fillRect(x + 12, y + 6, w - 8, h);
  ctx.strokeStyle = "#CCCCCC";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 12, y + 6, w - 8, h);
  // Blue tint (presentation placeholder)
  ctx.fillStyle = "rgba(52, 152, 219, 0.15)";
  ctx.fillRect(x + 20, y + 14, w - 24, h - 16);
  // Text lines (fake presentation content)
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + 30, y + 22 + i * 16, w - 50 - i * 20, 3);
  }
  // Pull cord
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + w / 2 + 8, y + 6 + h);
  ctx.lineTo(x + w / 2 + 8, y + 6 + h + 20);
  ctx.stroke();
  // Cord handle
  ctx.fillStyle = "#DDD";
  ctx.beginPath();
  ctx.arc(x + w / 2 + 8, y + 6 + h + 23, 4, 0, Math.PI * 2);
  ctx.fill();
}

// ── 白板（像素風）──
function drawWhiteboard(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = TILE * 2, h = TILE * 0.8;
  // Board
  ctx.fillStyle = "#FAFAFA";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#AAAAAA";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  // Frame
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  // Marker tray
  ctx.fillStyle = "#CCCCCC";
  ctx.fillRect(x + 10, y + h - 2, w - 20, 8);
  // Markers
  const markers = ["#E74C3C", "#2ECC71", "#3498DB", "#000000"];
  for (let i = 0; i < markers.length; i++) {
    ctx.fillStyle = markers[i];
    ctx.fillRect(x + 20 + i * 22, y + h, 16, 6);
  }
  // Scribbles on whiteboard
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 15, y + 15);
  ctx.lineTo(x + w * 0.6, y + 15);
  ctx.moveTo(x + 15, y + 28);
  ctx.lineTo(x + w * 0.5, y + 28);
  ctx.moveTo(x + 15, y + 41);
  ctx.lineTo(x + w * 0.4, y + 41);
  ctx.stroke();
  // A small diagram (box + arrow)
  ctx.strokeStyle = "rgba(52, 152, 219, 0.25)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + w * 0.65, y + 12, 30, 20);
  ctx.strokeRect(x + w * 0.65 + 45, y + 12, 30, 20);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.65 + 30, y + 22);
  ctx.lineTo(x + w * 0.65 + 45, y + 22);
  ctx.stroke();
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
  ctx.fillText("茶水間", tx(2), ty(19) + TILE * 0.7);
  ctx.fillText("會議室", tx(8), ty(19) + TILE * 0.7);
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
  const centerX = tx(6);   // 地板中央附近 (col 6)
  const centerY = ty(7);   // row 5-6 空白處
  ctx.translate(centerX, centerY);
  ctx.rotate(-5 * Math.PI / 180); // 微微傾斜 -5 度
  ctx.font = "bold 72px 'Courier New', monospace";
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("MindFork Office", 0, 0);
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
  drawWhiteboardPostIts(ctx);
  drawDesks(ctx, tileImg);
  drawPlant(ctx, tileImg);
  drawTearoom(ctx, tileImg);
  drawMeetingRoom(ctx, tileImg);
  drawLabels(ctx);
}
