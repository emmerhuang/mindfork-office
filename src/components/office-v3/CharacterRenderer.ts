// CharacterRenderer.ts — 角色繪製（PixelLab 獨立圖 / Gemini atlas / fallback 程式化）

import { CharacterDef } from "./officeData";
import { CHAR_SPRITES, PIXELLAB_CHARACTERS, PIXELLAB_DIRS } from "./spriteAtlas";

// 顯示大小：人 64x80，Waffles 64x56
const HUMAN_W = 78, HUMAN_H = 132;
const DOG_W = 78, DOG_H = 120;

/** 從移動向量推算面朝方向 */
function facingDir(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return "south";
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  char: CharacterDef,
  animFrame: number,
  geminiAtlasImg: HTMLImageElement | null,
  pixelLabImgs: Record<string, HTMLImageElement>,
  dx: number = 0,
  dy: number = 0,
) {
  const isWaff = !!char.isWaffles;
  const dw = isWaff ? DOG_W : HUMAN_W;
  const dh = isWaff ? DOG_H : HUMAN_H;

  // 地面陰影
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + dh / 2 - 2, dw / 2 - 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- PixelLab characters ---
  if (PIXELLAB_CHARACTERS.has(char.id)) {
    const img = pixelLabImgs[char.id];
    if (img) {
      const dir = facingDir(dx, dy);
      const f = PIXELLAB_DIRS[dir];
      ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, cy - dh / 2, dw, dh);
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
    ctx.drawImage(geminiAtlasImg, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, cy - dh / 2, dw, dh);
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
