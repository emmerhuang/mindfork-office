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
      drawSprite(ctx, img, segs[i], i * segW, 0, segW, wallH);
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
  const by = ty(ROOMS.tearoom.y);
  if (img) {
    // 冰箱（左上角），飲水機（緊接，小30%），咖啡機（緊接，小50%）
    const fridgeW = TILE * 1.5, fridgeH = TILE * 2.2;
    const waterW = TILE * 0.7, waterH = TILE * 1.54;
    const coffeeW = TILE * 0.6, coffeeH = TILE * 1.0;
    let cx = bx + 4;
    drawSprite(ctx, img, TILE_SPRITES.fridge,         cx, by + 4, fridgeW, fridgeH);
    cx += fridgeW + 4;
    drawSprite(ctx, img, TILE_SPRITES.water_cooler,    cx, by + 4 + (fridgeH - waterH), waterW, waterH);
    cx += waterW + 4;
    drawSprite(ctx, img, TILE_SPRITES.coffee_machine,  cx, by + 4 + (fridgeH - coffeeH), coffeeW, coffeeH);
  } else {
    ctx.fillStyle = "#C8D0D8";
    ctx.fillRect(bx + TILE, by + TILE, TILE * 2, TILE * 2);
    ctx.fillStyle = "#AACCDD";
    ctx.fillRect(bx + TILE * 4, by + TILE, TILE, TILE * 2);
    ctx.fillStyle = "#5A3A2A";
    ctx.fillRect(bx + TILE * 6, by + TILE, TILE + 4, TILE + 8);
  }
}

// ── 會議室 ────────────────────────────────────────────────

function drawMeetingRoom(ctx: CanvasRenderingContext2D, tileImg?: HTMLImageElement | null) {
  const rm = ROOMS.meetingRoom;
  const cx = tx(rm.x + rm.w / 2);
  const cy = ty(rm.y + rm.h / 2);

  if (tileImg) {
    // 會議桌 sprite
    const s = TILE_SPRITES.conference_table;
    if (s) {
      const dw = TILE * 2.8;
      const dh = dw * (s.sh / s.sw);
      drawSprite(ctx, tileImg, s, cx - dw / 2, cy - dh / 2 - TILE * 0.3, dw, dh);
    }
    // 白板已移至上方牆面（時鐘旁）
  } else {
    // fallback
    const tw = TILE * 3, th = TILE * 1.2;
    ctx.fillStyle = "#B8946A";
    ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th);
    // 白板
    const wbX = tx(rm.x + 1), wbY = ty(rm.y) + 2;
    ctx.fillStyle = "#F5F5F5";
    ctx.fillRect(wbX, wbY, TILE * 4, TILE * 0.7);
  }
}

// ── 區域標籤 ──────────────────────────────────────────────

function drawLabels(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillText("茶水間", tx(3), ty(14));
  ctx.fillText("會議室", tx(9), ty(14));
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

// ── 公開 API ──────────────────────────────────────────────

export function renderStaticScene(
  ctx: CanvasRenderingContext2D,
  tileImg: HTMLImageElement | null,
) {
  ctx.fillStyle = "#888";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawFloor(ctx, tileImg);
  drawWalls(ctx, tileImg);
  drawDesks(ctx, tileImg);
  drawPlant(ctx, tileImg);
  drawTearoom(ctx, tileImg);
  drawMeetingRoom(ctx, tileImg);
  drawLabels(ctx);
}
