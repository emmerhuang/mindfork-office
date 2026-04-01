// TileRenderer.ts — 靜態場景預渲染（地板、牆面、家具、茶水間、會議室）

import { TILE, CANVAS_W, CANVAS_H, CHARACTERS, ROOMS } from "./officeData";
import { TILE_SPRITES, SpriteFrame } from "./spriteAtlas";

const tx = (c: number) => c * TILE;
const ty = (r: number) => r * TILE;

// ── Map Object PNG 快取 ─────────────────────────────────
const MAP_OBJ_NAMES = [
  "fridge", "water-cooler", "coffee-machine", "cafe-table",
  "vending-machine", "conference-table", "projector-screen", "trash-can",
] as const;

const mapObjCache: Record<string, HTMLImageElement> = {};

function getMapObj(name: string): HTMLImageElement | undefined {
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

  // ── Row 17（頂部靠牆）: fridge(64x64) + water-cooler(48x48) + coffee-machine(48x48) ──
  // 三個家電底部對齊 row 17 底部（by + TILE）
  const rowBottom = by + TILE;

  const fridge = getMapObj("fridge");
  if (fridge) {
    ctx.drawImage(fridge, bx + 8, rowBottom - 64, 64, 64);
  }
  const waterCooler = getMapObj("water-cooler");
  if (waterCooler) {
    ctx.drawImage(waterCooler, bx + 80, rowBottom - 48, 48, 48);
  }
  const coffee = getMapObj("coffee-machine");
  if (coffee) {
    ctx.drawImage(coffee, bx + 136, rowBottom - 48, 48, 48);
  }

  // ── Row 17 右側 col 5：vending-machine(64x64) ──
  const vending = getMapObj("vending-machine");
  if (vending) {
    ctx.drawImage(vending, tx(5), rowBottom - 64, 64, 64);
  }

  // ── Rows 18-19（中間）: cafe-table(96x96) 居中 ──
  const cafeTable = getMapObj("cafe-table");
  if (cafeTable) {
    const areaW = ROOMS.tearoom.w * TILE;         // 6 * 64 = 384
    const tableX = bx + (areaW - 96) / 2;
    const tableY = ty(18) + (TILE * 2 - 96) / 2;  // 2 rows 居中
    ctx.drawImage(cafeTable, tableX, tableY, 96, 96);
  }

  // ── Row 21 左下角：trash-can(40x48) ──
  const trashCan = getMapObj("trash-can");
  if (trashCan) {
    ctx.drawImage(trashCan, bx + 8, ty(21) + (TILE - 48), 40, 48);
  }
}


// ── 會議室 ────────────────────────────────────────────────

function drawMeetingRoom(ctx: CanvasRenderingContext2D) {
  const rm = ROOMS.meetingRoom;
  const rmX = tx(rm.x);    // col 6
  const rmY = ty(rm.y);    // row 17
  const areaW = rm.w * TILE; // 6 * 64 = 384

  // ── Row 17（頂部）: projector-screen(128x128) 居中 ──
  const projector = getMapObj("projector-screen");
  if (projector) {
    const screenX = rmX + (areaW - 128) / 2;
    ctx.drawImage(projector, screenX, rmY, 128, 128);
  }

  // ── Rows 18-20: conference-table(160x160) 居中 ──
  const confTable = getMapObj("conference-table");
  if (confTable) {
    const tableX = rmX + (areaW - 160) / 2;
    const tableY = ty(18) + (TILE * 3 - 160) / 2; // 3 rows 居中
    ctx.drawImage(confTable, tableX, tableY, 160, 160);
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
  drawTearoom(ctx);
  drawMeetingRoom(ctx);
  drawLabels(ctx);
}
