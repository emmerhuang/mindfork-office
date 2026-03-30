// CharacterRenderer.ts — 角色繪製（PixelLab 獨立圖 / Gemini atlas / fallback 程式化）

import { CharacterDef } from "./officeData";
import { CHAR_SPRITES, PIXELLAB_CHARACTERS, PIXELLAB_DIRS } from "./spriteAtlas";

// 顯示大小（依 sprite 來源分開，避免變形）
// Gemini atlas sprites ~115x203 → 117x198（等比 x1.5）
const GEMINI_W = 117, GEMINI_H = 198;
// PixelLab sprites 48x48 → 144x144（等比 3x，保持正方形）
const PIXELLAB_W = 144, PIXELLAB_H = 144;
// Waffles (Gemini atlas ~112x170 → 117x180)
const DOG_W = 117, DOG_H = 180;

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  char: CharacterDef,
  animFrame: number,
  geminiAtlasImg: HTMLImageElement | null,
  pixelLabImgs: Record<string, HTMLImageElement>,
  facing: string = "south",
) {
  const isWaff = !!char.isWaffles;
  const isPixelLab = PIXELLAB_CHARACTERS.has(char.id);

  // 依 sprite 來源選擇顯示尺寸
  const dw = isWaff ? DOG_W : isPixelLab ? PIXELLAB_W : GEMINI_W;
  const dh = isWaff ? DOG_H : isPixelLab ? PIXELLAB_H : GEMINI_H;

  // 所有角色以「腳底」對齊：cy 視為角色底部基準
  // 繪製區域 top-left = (cx - dw/2, cy - dh + footOffset)
  // footOffset 讓腳底保持在統一的 cy + GEMINI_H/2 位置
  const footY = cy + GEMINI_H / 2;  // 統一地面基準線

  // 地面陰影（統一在地面基準線）
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(cx, footY - 2, dw / 2 - 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- PixelLab characters ---
  if (isPixelLab) {
    const img = pixelLabImgs[char.id];
    if (img) {
      const f = PIXELLAB_DIRS[facing] ?? PIXELLAB_DIRS["south"];
      ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, footY - dh, dw, dh);
      return;
    }
    // fallback if image not loaded
    drawHumanFallback(ctx, cx, cy, char.color, animFrame);
    return;
  }

  // --- Gemini atlas characters ---
  const sprites = CHAR_SPRITES[char.id];
  if (geminiAtlasImg && sprites) {
    const frames = sprites.front;
    const f = frames[animFrame % frames.length];
    ctx.drawImage(geminiAtlasImg, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, footY - dh, dw, dh);
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
