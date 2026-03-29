// CharacterRenderer.ts — 角色繪製（sprite 優先，fallback 程式化）

import { CharacterDef } from "./officeData";
import { CHAR_SPRITES } from "./spriteAtlas";

// 顯示大小：人 64x80，Waffles 64x56
const HUMAN_W = 52, HUMAN_H = 88;
const DOG_W = 52, DOG_H = 80;

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  char: CharacterDef,
  animFrame: number,
  charImg: HTMLImageElement | null,
) {
  const sprites = CHAR_SPRITES[char.id];
  const isWaff = !!char.isWaffles;
  const dw = isWaff ? DOG_W : HUMAN_W;
  const dh = isWaff ? DOG_H : HUMAN_H;

  // 地面陰影
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + dh / 2 - 2, dw / 2 - 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (charImg && sprites) {
    const frames = sprites.front;
    const f = frames[animFrame % frames.length];
    ctx.drawImage(charImg, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, cy - dh / 2, dw, dh);
    return;
  }

  // fallback: 簡單圓+橢圓
  if (isWaff) {
    drawWafflesFallback(ctx, cx, cy, char.color, animFrame);
  } else {
    drawHumanFallback(ctx, cx, cy, char.color, animFrame);
  }
}

function drawHumanFallback(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, color: string, frame: number,
) {
  // 身體
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 14, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // 頭
  ctx.fillStyle = "#F0C8A0";
  ctx.beginPath();
  ctx.arc(cx, cy - 8, 12, 0, Math.PI * 2);
  ctx.fill();
  // 眼睛
  ctx.fillStyle = "#333";
  ctx.fillRect(cx - 4, cy - 10, 2, 2);
  ctx.fillRect(cx + 3, cy - 10, 2, 2);
  // 手臂動畫
  const off = frame === 0 ? -2 : 2;
  ctx.fillStyle = "#F0C8A0";
  ctx.beginPath(); ctx.ellipse(cx - 15, cy + 6 + off, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 15, cy + 6 - off, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
}

function drawWafflesFallback(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, color: string, frame: number,
) {
  // 身體
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // 頭
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 8, 0, Math.PI * 2);
  ctx.fill();
  // 耳朵
  ctx.fillStyle = "#C87F0A";
  ctx.beginPath(); ctx.moveTo(cx - 7, cy - 8); ctx.lineTo(cx - 12, cy - 18); ctx.lineTo(cx - 2, cy - 11); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 7, cy - 8); ctx.lineTo(cx + 12, cy - 18); ctx.lineTo(cx + 2, cy - 11); ctx.fill();
  // 眼睛
  ctx.fillStyle = "#333";
  ctx.fillRect(cx - 3, cy - 7, 2, 2);
  ctx.fillRect(cx + 2, cy - 7, 2, 2);
  // 腿動畫
  const off = frame === 0 ? 1 : -1;
  ctx.fillStyle = "#C87F0A";
  ctx.beginPath(); ctx.ellipse(cx - 7, cy + 10 + off, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 7, cy + 10 - off, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
}
