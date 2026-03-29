// TileRenderer.ts — 靜態場景預渲染（地板、牆面、家具）
// 繪製到 offscreen canvas，主迴圈只需 drawImage 一次

import { TILE, CANVAS_W, CANVAS_H, COLS, ROWS, COLORS, ROOMS, CHARACTERS } from "./officeData";
import { TILE_SPRITES, SpriteFrame } from "./spriteAtlas";

function tx(col: number) { return col * TILE; }
function ty(row: number) { return row * TILE; }

// ────────────────────────────────────────────────────────────
// 輔助：從 tileset 繪製 sprite 到指定位置
// ────────────────────────────────────────────────────────────

function drawSprite(
  ctx: CanvasRenderingContext2D,
  tileImg: HTMLImageElement,
  sprite: SpriteFrame,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  ctx.drawImage(
    tileImg,
    sprite.sx, sprite.sy, sprite.sw, sprite.sh,
    dx, dy, dw, dh
  );
}

// ────────────────────────────────────────────────────────────
// 地板渲染（保持程式化——單色+格線看起來就很好）
// ────────────────────────────────────────────────────────────

function drawFloor(ctx: CanvasRenderingContext2D, tileImg?: HTMLImageElement | null) {
  const { tearoom, meetingRoom, workArea } = ROOMS;

  if (tileImg) {
    // 用 sprite 鋪地板
    const floorSprite = TILE_SPRITES.floor_blue;
    for (let r = workArea.bounds.y; r < workArea.bounds.y + workArea.bounds.h; r++) {
      for (let c = workArea.bounds.x; c < workArea.bounds.x + workArea.bounds.w; c++) {
        drawSprite(ctx, tileImg, floorSprite, tx(c), ty(r), TILE, TILE);
      }
    }

    const tearoomSprite = TILE_SPRITES.floor_wood;
    for (let r = tearoom.bounds.y; r < tearoom.bounds.y + tearoom.bounds.h; r++) {
      for (let c = tearoom.bounds.x; c < tearoom.bounds.x + tearoom.bounds.w; c++) {
        drawSprite(ctx, tileImg, tearoomSprite, tx(c), ty(r), TILE, TILE);
      }
    }

    const meetingSprite = TILE_SPRITES.floor_purple;
    for (let r = meetingRoom.bounds.y; r < meetingRoom.bounds.y + meetingRoom.bounds.h; r++) {
      for (let c = meetingRoom.bounds.x; c < meetingRoom.bounds.x + meetingRoom.bounds.w; c++) {
        drawSprite(ctx, tileImg, meetingSprite, tx(c), ty(r), TILE, TILE);
      }
    }
  } else {
    // fallback 程式化地板
    ctx.fillStyle = COLORS.floorMain;
    ctx.fillRect(
      tx(workArea.bounds.x),
      ty(workArea.bounds.y),
      workArea.bounds.w * TILE,
      workArea.bounds.h * TILE
    );

    ctx.fillStyle = COLORS.floorTearoom;
    ctx.fillRect(
      tx(tearoom.bounds.x),
      ty(tearoom.bounds.y),
      tearoom.bounds.w * TILE,
      tearoom.bounds.h * TILE
    );

    ctx.fillStyle = COLORS.floorMeeting;
    ctx.fillRect(
      tx(meetingRoom.bounds.x),
      ty(meetingRoom.bounds.y),
      meetingRoom.bounds.w * TILE,
      meetingRoom.bounds.h * TILE
    );
  }

  // 格線（sprite 和 fallback 都畫，提供視覺結構）
  ctx.strokeStyle = "rgba(0,0,0,0.05)";
  ctx.lineWidth = 0.5;
  for (let c = workArea.bounds.x; c <= workArea.bounds.x + workArea.bounds.w; c++) {
    ctx.beginPath();
    ctx.moveTo(tx(c), ty(workArea.bounds.y));
    ctx.lineTo(tx(c), ty(workArea.bounds.y + workArea.bounds.h));
    ctx.stroke();
  }
  for (let r = workArea.bounds.y; r <= workArea.bounds.y + workArea.bounds.h; r++) {
    ctx.beginPath();
    ctx.moveTo(tx(workArea.bounds.x), ty(r));
    ctx.lineTo(tx(workArea.bounds.x + workArea.bounds.w), ty(r));
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(180,130,0,0.08)";
  ctx.lineWidth = 0.5;
  for (let c = tearoom.bounds.x; c <= tearoom.bounds.x + tearoom.bounds.w; c++) {
    ctx.beginPath();
    ctx.moveTo(tx(c), ty(tearoom.bounds.y));
    ctx.lineTo(tx(c), ty(tearoom.bounds.y + tearoom.bounds.h));
    ctx.stroke();
  }
  for (let r = tearoom.bounds.y; r <= tearoom.bounds.y + tearoom.bounds.h; r++) {
    ctx.beginPath();
    ctx.moveTo(tx(tearoom.bounds.x), ty(r));
    ctx.lineTo(tx(tearoom.bounds.x + tearoom.bounds.w), ty(r));
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(100,80,150,0.07)";
  ctx.lineWidth = 0.5;
  for (let c = meetingRoom.bounds.x; c <= meetingRoom.bounds.x + meetingRoom.bounds.w; c++) {
    ctx.beginPath();
    ctx.moveTo(tx(c), ty(meetingRoom.bounds.y));
    ctx.lineTo(tx(c), ty(meetingRoom.bounds.y + meetingRoom.bounds.h));
    ctx.stroke();
  }
  for (let r = meetingRoom.bounds.y; r <= meetingRoom.bounds.y + meetingRoom.bounds.h; r++) {
    ctx.beginPath();
    ctx.moveTo(tx(meetingRoom.bounds.x), ty(r));
    ctx.lineTo(tx(meetingRoom.bounds.x + meetingRoom.bounds.w), ty(r));
    ctx.stroke();
  }
}

// ────────────────────────────────────────────────────────────
// 牆壁渲染（保持程式化——牆面用單色+程式化裝飾即可）
// ────────────────────────────────────────────────────────────

function drawWalls(ctx: CanvasRenderingContext2D, tileImg?: HTMLImageElement | null) {
  if (tileImg) {
    // 用 sprite 拼接牆面：6 段，每段 2 tile 寬，3 tile 高
    const wallH = TILE * 3;
    const segW = TILE * 2;
    const segments: SpriteFrame[] = [
      TILE_SPRITES.wall_bookshelf,
      TILE_SPRITES.wall_window,
      TILE_SPRITES.wall_plain,
      TILE_SPRITES.wall_clock,
      TILE_SPRITES.wall_window,
      TILE_SPRITES.wall_bookshelf,
    ];
    for (let i = 0; i < segments.length; i++) {
      drawSprite(ctx, tileImg, segments[i], i * segW, 0, segW, wallH);
    }

    // 踢腳板（深色橫線，sprite 不含此細節）
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, ty(3), CANVAS_W, 3);
  } else {
    // fallback 程式化牆面
    ctx.fillStyle = COLORS.wallBase;
    ctx.fillRect(0, 0, CANVAS_W, ty(3));

    ctx.fillStyle = COLORS.wallTop;
    ctx.fillRect(0, ty(3) - 4, CANVAS_W, 4);

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, ty(3), CANVAS_W, 3);

    const windowPositions = [2, 8, 16, 22];
    for (const wx of windowPositions) {
      drawWindow(ctx, tx(wx), ty(0) + 4, TILE * 4, ty(3) - 8);
    }

    drawBookshelf(ctx, tx(0), ty(0), TILE * 2, ty(3));
    drawBookshelf(ctx, tx(12), ty(0), TILE * 2, ty(3));
    drawBookshelf(ctx, tx(26), ty(0), TILE * 2, ty(3));

    drawPlant(ctx, tx(28), ty(3) - 4);
    drawPlant(ctx, tx(1), ty(3) - 4);
  }

  // 區域標籤（sprite/fallback 都需要）
  drawAreaLabel(ctx, tx(3), ty(14), "茶水間");
  drawAreaLabel(ctx, tx(19), ty(14), "會議室");

  // 房間分隔線
  ctx.strokeStyle = COLORS.roomDivider;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(tx(ROOMS.meetingRoom.bounds.x), ty(ROOMS.tearoom.bounds.y));
  ctx.lineTo(tx(ROOMS.meetingRoom.bounds.x), ty(ROWS));
  ctx.stroke();
  ctx.setLineDash([]);

  // 主工作區下邊界
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, ty(ROOMS.tearoom.bounds.y));
  ctx.lineTo(CANVAS_W, ty(ROOMS.tearoom.bounds.y));
  ctx.stroke();
}

function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // 窗框
  ctx.fillStyle = COLORS.wallWindowFrame;
  ctx.fillRect(x, y, w, h);

  const border = 3;
  // 玻璃
  ctx.fillStyle = COLORS.wallWindow;
  ctx.fillRect(x + border, y + border, w - border * 2, h - border * 2);

  // 窗格（十字）
  ctx.fillStyle = COLORS.wallWindowFrame;
  ctx.fillRect(x + w / 2 - 1, y + border, 2, h - border * 2);
  ctx.fillRect(x + border, y + h / 2 - 1, w - border * 2, 2);

  // 反光
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(x + border + 2, y + border + 2, 6, 4);
}

function drawBookshelf(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // 書架背板
  ctx.fillStyle = COLORS.bookshelf;
  ctx.fillRect(x, y, w, h);

  // 書本
  const bookW = 6;
  const bookColors = COLORS.bookColors;
  let bx = x + 3;
  let colorIdx = 0;
  while (bx + bookW < x + w - 3) {
    const bookH = h * 0.5 + Math.random() * h * 0.2;
    ctx.fillStyle = bookColors[colorIdx % bookColors.length];
    ctx.fillRect(bx, y + h - bookH - 2, bookW - 1, bookH);
    bx += bookW;
    colorIdx++;
  }
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // 花盆
  ctx.fillStyle = COLORS.plantPot;
  ctx.fillRect(x + 4, y - 8, 8, 8);
  // 葉子（三個橢圓）
  ctx.fillStyle = COLORS.plantLeaf;
  ctx.beginPath(); ctx.ellipse(x + 8, y - 14, 5, 8, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 12, y - 12, 4, 7, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 5, y - 12, 4, 7, 0.5, 0, Math.PI * 2); ctx.fill();
}

function drawAreaLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.save();
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ────────────────────────────────────────────────────────────
// 家具渲染（有 tileImg 時用 sprite，否則 fallback）
// ────────────────────────────────────────────────────────────

let deskIndex = 0; // 用來交替 monitor/laptop

function drawDesk(ctx: CanvasRenderingContext2D, tileX: number, tileY: number, color: string, isWaffles?: boolean, tileImg?: HTMLImageElement | null) {
  const x = tx(tileX);
  const y = ty(tileY);
  const dw = TILE * 2; // 桌寬 2 tiles
  const dh = TILE;     // 桌高 1 tile

  if (isWaffles) {
    // 狗窩
    if (tileImg) {
      const bed = TILE_SPRITES.dog_bed;
      drawSprite(ctx, tileImg, bed, x, y - 4, dw, dh + 4);
      // 狗碗在旁邊
      const bowl = TILE_SPRITES.dog_bowl;
      drawSprite(ctx, tileImg, bowl, x + dw + 2, y + 4, TILE * 0.8, TILE * 0.5);
    } else {
      // fallback 程式化
      ctx.fillStyle = COLORS.dogBedDark;
      ctx.beginPath();
      ctx.ellipse(x + dw / 2, y + dh / 2 + 4, dw / 2 - 2, dh / 2 - 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.dogBed;
      ctx.beginPath();
      ctx.ellipse(x + dw / 2, y + dh / 2 + 4, dw / 2 - 5, dh / 2 - 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFF";
      ctx.fillRect(x + dw / 2 - 3, y + dh / 2 + 2, 6, 2);
      ctx.fillRect(x + dw / 2 - 1, y + dh / 2, 2, 6);
    }
    return;
  }

  if (tileImg) {
    // 用 sprite 繪製桌子（交替 monitor/laptop）
    const spriteKey = deskIndex % 2 === 0 ? "desk_monitor" : "desk_laptop";
    const sprite = TILE_SPRITES[spriteKey];
    // 桌子 sprite 寬高比約 294:279，顯示在 2 tile 寬 x 1.2 tile 高
    const spriteH = Math.round(dw * (sprite.sh / sprite.sw));
    drawSprite(ctx, tileImg, sprite, x, y + dh - spriteH, dw, spriteH);
    deskIndex++;
  } else {
    // fallback 程式化桌子（不再畫椅子——任務 H）
    // 桌面陰影
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(x + 2, y + 3, dw, dh);

    // 桌面（木色）
    ctx.fillStyle = COLORS.deskTop;
    ctx.fillRect(x, y, dw, dh);

    // 桌邊（立體感）
    ctx.fillStyle = COLORS.deskSide;
    ctx.fillRect(x, y + dh - 4, dw, 4);

    // 電腦螢幕
    const scrW = 14;
    const scrH = 10;
    const scrX = x + dw / 2 - 2;
    const scrY = y + 4;

    ctx.fillStyle = COLORS.computerBase;
    ctx.fillRect(scrX + 4, scrY + scrH, 6, 3);
    ctx.fillRect(scrX + 1, scrY + scrH + 3, 12, 2);

    ctx.fillStyle = COLORS.computerScreen;
    ctx.fillRect(scrX, scrY, scrW, scrH);

    ctx.fillStyle = color + "40";
    ctx.fillRect(scrX + 1, scrY + 1, scrW - 2, scrH - 2);

    // 鍵盤
    ctx.fillStyle = COLORS.keyboardColor;
    ctx.fillRect(x + 2, y + dh - 10, 12, 6);

    // 滑鼠
    ctx.fillStyle = "#AAAAAA";
    ctx.fillRect(x + 16, y + dh - 9, 5, 7);
    ctx.fillStyle = "#888888";
    ctx.fillRect(x + 18, y + dh - 9, 1, 3);
  }
}

function drawConferenceTable(ctx: CanvasRenderingContext2D, tileImg?: HTMLImageElement | null) {
  const { meetingRoom } = ROOMS;
  const cx = tx(meetingRoom.bounds.x + meetingRoom.bounds.w / 2);
  const cy = ty(meetingRoom.bounds.y + meetingRoom.bounds.h / 2) - TILE;

  {
    // fallback 程式化
    const tw = TILE * 3;
    const th = TILE * 1.2;

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(cx - tw / 2 + 3, cy - th / 2 + 4, tw, th);

    ctx.fillStyle = COLORS.confTable;
    ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th);

    ctx.fillStyle = "#D0A87A";
    ctx.fillRect(cx - tw / 2, cy - th / 2, tw, 3);

    ctx.fillStyle = COLORS.deskSide;
    ctx.fillRect(cx - tw / 2, cy + th / 2 - 4, tw, 4);

    // 椅子（環繞桌子）
    const chairPositions = [
      { x: cx - tw / 2 - 12, y: cy },
      { x: cx + tw / 2 + 4, y: cy },
      { x: cx - tw / 4, y: cy - th / 2 - 12 },
      { x: cx + tw / 4, y: cy - th / 2 - 12 },
      { x: cx - tw / 4, y: cy + th / 2 + 4 },
      { x: cx + tw / 4, y: cy + th / 2 + 4 },
    ];

    for (const pos of chairPositions) {
      ctx.fillStyle = COLORS.confChair;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#A08070";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 水杯
    const cupPositions = [
      { x: cx - 20, y: cy },
      { x: cx, y: cy - 5 },
      { x: cx + 20, y: cy },
    ];
    for (const pos of cupPositions) {
      ctx.fillStyle = "#87CEEB80";
      ctx.fillRect(pos.x - 3, pos.y - 5, 6, 8);
      ctx.strokeStyle = "#87CEEB";
      ctx.lineWidth = 1;
      ctx.strokeRect(pos.x - 3, pos.y - 5, 6, 8);
    }
  }
}

function drawTearoomEquipment(ctx: CanvasRenderingContext2D, tileImg?: HTMLImageElement | null) {
  const { tearoom } = ROOMS;
  const baseX = tx(tearoom.bounds.x);
  const baseY = ty(tearoom.bounds.y);

  if (tileImg) {
    // 冰箱
    const fridgeSprite = TILE_SPRITES.fridge;
    drawSprite(ctx, tileImg, fridgeSprite, baseX + TILE, baseY + TILE * 0.5, TILE * 1.5, TILE * 2.2);

    // 飲水機
    const waterSprite = TILE_SPRITES.water_cooler;
    drawSprite(ctx, tileImg, waterSprite, baseX + TILE * 3.2, baseY + TILE * 0.3, TILE, TILE * 2.2);

    // 咖啡機
    const coffeeSprite = TILE_SPRITES.coffee_machine;
    drawSprite(ctx, tileImg, coffeeSprite, baseX + TILE * 4.8, baseY + TILE * 0.5, TILE * 1.2, TILE * 2);
  } else {
    // fallback 程式化

    // 冰箱
    const fridgeX = baseX + TILE;
    const fridgeY = baseY + TILE;
    ctx.fillStyle = "#C8D0D8";
    ctx.fillRect(fridgeX, fridgeY, TILE * 2, TILE * 2);
    ctx.fillStyle = "#A8B0B8";
    ctx.fillRect(fridgeX, fridgeY, TILE * 2, TILE);
    ctx.fillStyle = "#666";
    ctx.fillRect(fridgeX + TILE * 2 - 4, fridgeY + 4, 2, TILE - 8);
    ctx.fillRect(fridgeX + TILE * 2 - 4, fridgeY + TILE + 4, 2, TILE - 8);

    // 飲水機
    const waterX = baseX + TILE * 4;
    const waterY = baseY + TILE;
    ctx.fillStyle = COLORS.waterCooler;
    ctx.fillRect(waterX, waterY, TILE, TILE * 2);
    ctx.fillStyle = "#7AAABB";
    ctx.beginPath();
    ctx.arc(waterX + TILE / 2, waterY + 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#87CEEB60";
    ctx.beginPath();
    ctx.ellipse(waterX + TILE / 2, waterY + 4, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // 咖啡機
    const coffeeX = baseX + TILE * 6;
    const coffeeY = baseY + TILE;
    ctx.fillStyle = COLORS.coffeeMaker;
    ctx.fillRect(coffeeX, coffeeY, TILE + 4, TILE + 8);
    ctx.fillStyle = "#7A4A2A";
    ctx.fillRect(coffeeX + 6, coffeeY + TILE - 2, 8, 4);
    ctx.fillStyle = "#FF4444";
    ctx.fillRect(coffeeX + TILE - 2, coffeeY + 4, 3, 3);
    ctx.fillStyle = "#44FF44";
    ctx.fillRect(coffeeX + TILE - 2, coffeeY + 9, 3, 3);
  }

  // 流理台（程式化——tileset 沒有對應 sprite）
  ctx.fillStyle = "#C8C0B0";
  ctx.fillRect(baseX, baseY + TILE * 4, TILE * 10, TILE);
  ctx.fillStyle = "#B0A898";
  ctx.fillRect(baseX, baseY + TILE * 4, TILE * 10, 3);
  // 水槽
  ctx.fillStyle = "#A8B4B8";
  ctx.fillRect(baseX + TILE * 7, baseY + TILE * 4 + 3, TILE * 2, TILE - 3);
  ctx.fillStyle = "#88A0A4";
  ctx.fillRect(baseX + TILE * 7 + 3, baseY + TILE * 4 + 6, TILE * 2 - 6, TILE - 9);
}

// ────────────────────────────────────────────────────────────
// 會議室白板 — 任務 G
// ────────────────────────────────────────────────────────────

function drawWhiteboard(ctx: CanvasRenderingContext2D, tileImg?: HTMLImageElement | null) {
  const { meetingRoom } = ROOMS;
  // 白板掛在會議室牆上（上方），水平居中
  const wbX = tx(meetingRoom.bounds.x + 1);
  const wbY = ty(meetingRoom.bounds.y) + 2;
  const wbW = TILE * 4;
  const wbH = TILE * 0.7;

  {
    drawWhiteboardFallback(ctx, wbX, wbY, wbW, wbH);
  }
}

function drawWhiteboardFallback(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // 白板邊框（灰色金屬框）
  ctx.fillStyle = "#707880";
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

  // 白板面
  ctx.fillStyle = "#F5F5F5";
  ctx.fillRect(x, y, w, h);

  // 筆槽
  ctx.fillStyle = "#505860";
  ctx.fillRect(x + w * 0.2, y + h + 2, w * 0.6, 4);

  // 白板上的文字痕跡（裝飾）
  ctx.strokeStyle = "rgba(50,50,200,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 8);
  ctx.lineTo(x + w * 0.6, y + 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 16);
  ctx.lineTo(x + w * 0.4, y + 16);
  ctx.stroke();

  // 紅色標記
  ctx.strokeStyle = "rgba(200,50,50,0.25)";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.65, y + 6);
  ctx.lineTo(x + w * 0.85, y + h - 6);
  ctx.stroke();
}

// ────────────────────────────────────────────────────────────
// 公開 API：渲染整個靜態場景
// ────────────────────────────────────────────────────────────

export function renderStaticScene(ctx: CanvasRenderingContext2D, tileImg?: HTMLImageElement | null) {
  // 重設桌子交替計數器
  deskIndex = 0;

  // 底色（以防漏洞）
  ctx.fillStyle = "#888";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawFloor(ctx, tileImg);
  drawWalls(ctx, tileImg);

  // 所有角色的桌子
  for (const char of CHARACTERS) {
    drawDesk(ctx, char.deskTile.x, char.deskTile.y, char.color, char.isWaffles, tileImg);
  }

  // 盆栽（Boss 和 Secretary 中間）— 任務 F
  // 注意：Waffles 的 deskTile 是 (6,4)，盆栽不在這裡重複畫
  // 因為 Waffles 的桌位就是 (6,4) 且是狗窩，盆栽改放 (5,6) 避免重疊
  drawPottedPlantBetween(ctx, tileImg);

  // 會議桌
  drawConferenceTable(ctx, tileImg);

  // 會議室白板 — 任務 G
  drawWhiteboard(ctx, tileImg);

  // 茶水間設備
  drawTearoomEquipment(ctx, tileImg);
}

// 盆栽放在老大(2,4)和秘書長(7,4)中間，但 Waffles 狗窩在 (6,4)
// 所以盆栽放 (5,6) — 走道中間偏下，不擋桌子
function drawPottedPlantBetween(ctx: CanvasRenderingContext2D, tileImg?: HTMLImageElement | null) {
  const px = tx(5);
  const py = ty(4);

  if (tileImg) {
    const sprite = TILE_SPRITES.plant_tall;
    const dw = TILE * 0.9;
    const dh = Math.round(dw * (sprite.sh / sprite.sw));
    drawSprite(ctx, tileImg, sprite, px + (TILE - dw) / 2, py + TILE - dh, dw, dh);
  } else {
    drawPlant(ctx, px + 10, py + TILE - 2);
  }
}
