// TileRenderer.ts — 靜態場景預渲染（地板、牆面、家具）
// 繪製到 offscreen canvas，主迴圈只需 drawImage 一次

import { TILE, CANVAS_W, CANVAS_H, COLS, ROWS, COLORS, ROOMS, CHARACTERS } from "./officeData";

function tx(col: number) { return col * TILE; }
function ty(row: number) { return row * TILE; }

// ────────────────────────────────────────────────────────────
// 地板渲染
// ────────────────────────────────────────────────────────────

function drawFloor(ctx: CanvasRenderingContext2D) {
  const { tearoom, meetingRoom, workArea } = ROOMS;

  // 主工作區地板
  ctx.fillStyle = COLORS.floorMain;
  ctx.fillRect(
    tx(workArea.bounds.x),
    ty(workArea.bounds.y),
    workArea.bounds.w * TILE,
    workArea.bounds.h * TILE
  );

  // 地板格紋（細線）
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

  // 茶水間地板
  ctx.fillStyle = COLORS.floorTearoom;
  ctx.fillRect(
    tx(tearoom.bounds.x),
    ty(tearoom.bounds.y),
    tearoom.bounds.w * TILE,
    tearoom.bounds.h * TILE
  );

  // 茶水間格紋
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

  // 會議室地板
  ctx.fillStyle = COLORS.floorMeeting;
  ctx.fillRect(
    tx(meetingRoom.bounds.x),
    ty(meetingRoom.bounds.y),
    meetingRoom.bounds.w * TILE,
    meetingRoom.bounds.h * TILE
  );

  // 會議室格紋
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
// 牆壁渲染
// ────────────────────────────────────────────────────────────

function drawWalls(ctx: CanvasRenderingContext2D) {
  // 主牆背景（上方 3 tile 高）
  ctx.fillStyle = COLORS.wallBase;
  ctx.fillRect(0, 0, CANVAS_W, ty(3));

  // 牆頂邊條
  ctx.fillStyle = COLORS.wallTop;
  ctx.fillRect(0, ty(3) - 4, CANVAS_W, 4);

  // 踢腳板（深色橫線）
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, ty(3), CANVAS_W, 3);

  // 窗戶 x4（間隔分佈）
  const windowPositions = [2, 8, 16, 22]; // tile x 位置
  for (const wx of windowPositions) {
    drawWindow(ctx, tx(wx), ty(0) + 4, TILE * 4, ty(3) - 8);
  }

  // 書架 x2（左右各一組）
  drawBookshelf(ctx, tx(0), ty(0), TILE * 2, ty(3));
  drawBookshelf(ctx, tx(12), ty(0), TILE * 2, ty(3));
  drawBookshelf(ctx, tx(26), ty(0), TILE * 2, ty(3));

  // 植物（牆邊裝飾）
  drawPlant(ctx, tx(28), ty(3) - 4);
  drawPlant(ctx, tx(1), ty(3) - 4);

  // 區域標籤
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
// 家具渲染
// ────────────────────────────────────────────────────────────

function drawDesk(ctx: CanvasRenderingContext2D, tileX: number, tileY: number, color: string, isWaffles?: boolean) {
  const x = tx(tileX);
  const y = ty(tileY);
  const dw = TILE * 2; // 桌寬 2 tiles
  const dh = TILE;     // 桌高 1 tile

  if (isWaffles) {
    // 狗窩：橢圓形床墊
    ctx.fillStyle = COLORS.dogBedDark;
    ctx.beginPath();
    ctx.ellipse(x + dw / 2, y + dh / 2 + 4, dw / 2 - 2, dh / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.dogBed;
    ctx.beginPath();
    ctx.ellipse(x + dw / 2, y + dh / 2 + 4, dw / 2 - 5, dh / 2 - 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 骨頭標記
    ctx.fillStyle = "#FFF";
    ctx.fillRect(x + dw / 2 - 3, y + dh / 2 + 2, 6, 2);
    ctx.fillRect(x + dw / 2 - 1, y + dh / 2, 2, 6);
    return;
  }

  // 椅子（桌子前方）
  const chairY = y + dh + 3;
  ctx.fillStyle = COLORS.chairBase;
  ctx.beginPath();
  ctx.arc(x + dw / 2, chairY + 8, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.chairSeat;
  ctx.beginPath();
  ctx.arc(x + dw / 2, chairY + 8, 6, 0, Math.PI * 2);
  ctx.fill();

  // 桌面陰影
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(x + 2, y + 3, dw, dh);

  // 桌面（木色）
  ctx.fillStyle = COLORS.deskTop;
  ctx.fillRect(x, y, dw, dh);

  // 桌邊（立體感）
  ctx.fillStyle = COLORS.deskSide;
  ctx.fillRect(x, y + dh - 4, dw, 4);

  // 電腦螢幕（桌面中間偏右）
  const scrW = 14;
  const scrH = 10;
  const scrX = x + dw / 2 - 2;
  const scrY = y + 4;

  ctx.fillStyle = COLORS.computerBase;
  ctx.fillRect(scrX + 4, scrY + scrH, 6, 3);
  ctx.fillRect(scrX + 1, scrY + scrH + 3, 12, 2);

  ctx.fillStyle = COLORS.computerScreen;
  ctx.fillRect(scrX, scrY, scrW, scrH);

  // 螢幕發光（角色顏色）
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

function drawConferenceTable(ctx: CanvasRenderingContext2D) {
  const { meetingRoom } = ROOMS;
  const cx = tx(meetingRoom.bounds.x + meetingRoom.bounds.w / 2);
  const cy = ty(meetingRoom.bounds.y + meetingRoom.bounds.h / 2) - TILE;
  const tw = TILE * 6;
  const th = TILE * 2;

  // 桌面陰影
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(cx - tw / 2 + 3, cy - th / 2 + 4, tw, th);

  // 桌面
  ctx.fillStyle = COLORS.confTable;
  ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th);

  // 桌緣高光
  ctx.fillStyle = "#D0A87A";
  ctx.fillRect(cx - tw / 2, cy - th / 2, tw, 3);

  // 桌邊
  ctx.fillStyle = COLORS.deskSide;
  ctx.fillRect(cx - tw / 2, cy + th / 2 - 4, tw, 4);

  // 椅子（環繞桌子）
  const chairPositions = [
    { x: cx - tw / 2 - 12, y: cy },           // 左
    { x: cx + tw / 2 + 4, y: cy },            // 右
    { x: cx - tw / 4, y: cy - th / 2 - 12 }, // 上左
    { x: cx + tw / 4, y: cy - th / 2 - 12 }, // 上右
    { x: cx - tw / 4, y: cy + th / 2 + 4 },  // 下左
    { x: cx + tw / 4, y: cy + th / 2 + 4 },  // 下右
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

  // 水杯（桌上）
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

function drawTearoomEquipment(ctx: CanvasRenderingContext2D) {
  const { tearoom } = ROOMS;
  const baseX = tx(tearoom.bounds.x);
  const baseY = ty(tearoom.bounds.y);

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
  // 水桶（半透明藍）
  ctx.fillStyle = "#87CEEB60";
  ctx.beginPath();
  ctx.ellipse(waterX + TILE / 2, waterY + 4, 7, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // 咖啡機
  const coffeeX = baseX + TILE * 6;
  const coffeeY = baseY + TILE;
  ctx.fillStyle = COLORS.coffeeMaker;
  ctx.fillRect(coffeeX, coffeeY, TILE + 4, TILE + 8);
  // 咖啡杯出口
  ctx.fillStyle = "#7A4A2A";
  ctx.fillRect(coffeeX + 6, coffeeY + TILE - 2, 8, 4);
  // 操作面板（小白點）
  ctx.fillStyle = "#FF4444";
  ctx.fillRect(coffeeX + TILE - 2, coffeeY + 4, 3, 3);
  ctx.fillStyle = "#44FF44";
  ctx.fillRect(coffeeX + TILE - 2, coffeeY + 9, 3, 3);

  // 流理台（橫向長台）
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
// 公開 API：渲染整個靜態場景
// ────────────────────────────────────────────────────────────

export function renderStaticScene(ctx: CanvasRenderingContext2D) {
  // 底色（以防漏洞）
  ctx.fillStyle = "#888";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawFloor(ctx);
  drawWalls(ctx);

  // 所有角色的桌子
  for (const char of CHARACTERS) {
    drawDesk(ctx, char.deskTile.x, char.deskTile.y, char.color, char.isWaffles);
  }

  // 會議桌
  drawConferenceTable(ctx);

  // 茶水間設備
  drawTearoomEquipment(ctx);
}
