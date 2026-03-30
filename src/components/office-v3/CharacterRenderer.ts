// CharacterRenderer.ts — 角色繪製（PixelLab walking/celebrate/idle sprites）

import { CharacterDef } from "./officeData";
import {
  CHAR_SPRITES, PIXELLAB_CHARACTERS, PIXELLAB_DIRS,
  getWalkFrame, getCelebrateFrame, getWafflesFrame,
  WafflesAnim,
} from "./spriteAtlas";
import type { CharState } from "./CharacterManager";

// 顯示大小（依 sprite 來源分開，避免變形）
// PixelLab sprites 128x128 → 216x216（等比 1.6875x）
const PIXELLAB_W = 216, PIXELLAB_H = 216;
// PixelLab Waffles（柯基稍小）
const PIXELLAB_DOG_W = 180, PIXELLAB_DOG_H = 180;
// Gemini atlas sprites — 原始 80x135 * 1.5
const GEMINI_W = 120, GEMINI_H = 202;
// Waffles fallback（原始 80x120 * 1.5）
const DOG_W = 120, DOG_H = 180;

// 地面基準線偏移（固定值，不隨角色尺寸縮放）
const FOOT_OFFSET = 51;

export interface DrawCharOpts {
  state: CharState;
  facing: string;
  animFrame: number;
  celebrateFrame: number;
  wafflesAnim: WafflesAnim;
  statusIcon: string;
  tick: number;
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  char: CharacterDef,
  opts: DrawCharOpts,
  geminiAtlasImg: HTMLImageElement | null,
  pixelLabImgs: Record<string, HTMLImageElement>,
  walkImgs: Record<string, HTMLImageElement>,
  celebrateImgs: Record<string, HTMLImageElement>,
  wafflesExtraImgs: Record<string, HTMLImageElement>,
) {
  const isWaff = !!char.isWaffles;
  const isPixelLab = PIXELLAB_CHARACTERS.has(char.id);

  // 依 sprite 來源選擇顯示尺寸
  const dw = isWaff && isPixelLab ? PIXELLAB_DOG_W : isWaff ? DOG_W : isPixelLab ? PIXELLAB_W : GEMINI_W;
  const dh = isWaff && isPixelLab ? PIXELLAB_DOG_H : isWaff ? DOG_H : isPixelLab ? PIXELLAB_H : GEMINI_H;

  // 所有角色以「腳底」對齊
  const footY = cy + FOOT_OFFSET;

  // 地面陰影
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(cx, footY - 2, dw / 2 - 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Celebrate animation ---
  if (opts.state === "celebrating" && isPixelLab) {
    const celImg = celebrateImgs[char.id];
    if (celImg) {
      const f = getCelebrateFrame(char.id, opts.celebrateFrame);
      ctx.drawImage(celImg, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, footY - dh, dw, dh);
      drawStatusIcon(ctx, cx, footY - dh, opts.statusIcon, opts.tick);
      return;
    }
  }

  // --- Walking animation ---
  if (opts.state === "walking" && isPixelLab) {
    // Waffles: choose from walk/running/sneaking
    if (isWaff) {
      const extraImg = wafflesExtraImgs[opts.wafflesAnim];
      if (extraImg) {
        const f = getWafflesFrame(opts.wafflesAnim, opts.facing, opts.animFrame);
        ctx.drawImage(extraImg, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, footY - dh, dw, dh);
        drawStatusIcon(ctx, cx, footY - dh, opts.statusIcon, opts.tick);
        return;
      }
    }
    // Human characters: walk sprite sheet
    const walkImg = walkImgs[char.id];
    if (walkImg) {
      const f = getWalkFrame(opts.facing, opts.animFrame);
      ctx.drawImage(walkImg, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, footY - dh, dw, dh);
      drawStatusIcon(ctx, cx, footY - dh, opts.statusIcon, opts.tick);
      return;
    }
  }

  // --- Idle / Working: static direction sprite ---
  if (isPixelLab) {
    // Waffles idle animation
    if (isWaff && (opts.state === "idle_home" || opts.state === "working")) {
      const idleImg = wafflesExtraImgs["idle"];
      if (idleImg) {
        const f = getWafflesFrame("idle", opts.facing, opts.animFrame);
        ctx.drawImage(idleImg, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, footY - dh, dw, dh);
        drawStatusIcon(ctx, cx, footY - dh, opts.statusIcon, opts.tick);
        return;
      }
    }

    const img = pixelLabImgs[char.id];
    if (img) {
      const f = PIXELLAB_DIRS[opts.facing] ?? PIXELLAB_DIRS["south"];
      ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, footY - dh, dw, dh);
      drawStatusIcon(ctx, cx, footY - dh, opts.statusIcon, opts.tick);
      return;
    }
    drawHumanFallback(ctx, cx, cy, char.color, opts.animFrame);
    drawStatusIcon(ctx, cx, cy - 30, opts.statusIcon, opts.tick);
    return;
  }

  // --- Gemini atlas characters ---
  const sprites = CHAR_SPRITES[char.id];
  if (geminiAtlasImg && sprites) {
    const frames = sprites.front;
    const f = frames[opts.animFrame % frames.length];
    ctx.drawImage(geminiAtlasImg, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, footY - dh, dw, dh);
    drawStatusIcon(ctx, cx, footY - dh, opts.statusIcon, opts.tick);
    return;
  }

  // fallback
  if (isWaff) {
    drawWafflesFallback(ctx, cx, cy, char.color, opts.animFrame);
  } else {
    drawHumanFallback(ctx, cx, cy, char.color, opts.animFrame);
  }
  drawStatusIcon(ctx, cx, cy - 30, opts.statusIcon, opts.tick);
}

/** Draw Waffles bark animation (triggered on click) */
export function drawWafflesBark(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  dw: number, dh: number,
  footY: number,
  facing: string,
  frameIdx: number,
  barkImg: HTMLImageElement | null,
) {
  if (!barkImg) return false;
  const f = getWafflesFrame("bark", facing, frameIdx);
  ctx.drawImage(barkImg, f.sx, f.sy, f.sw, f.sh, cx - dw / 2, footY - dh, dw, dh);
  return true;
}

// ── Status icon (emoji above head) ──────────────────────────

function drawStatusIcon(ctx: CanvasRenderingContext2D, cx: number, topY: number, icon: string, tick: number) {
  if (!icon) return;
  // sin 波浮動：振幅 6px，週期 ~2 秒（60 ticks @ 30fps）
  const floatY = Math.sin((tick / 60) * Math.PI * 2) * 6;
  const iconY = topY - 12 + floatY;
  ctx.save();
  ctx.font = "56px serif";
  ctx.textAlign = "center";

  // 齒輪 ⚙️：旋轉動畫 + 金色 glow
  if (icon === "\u2699\uFE0F" || icon === "\u2699") {
    ctx.shadowColor = "gold";
    ctx.shadowBlur = 15;
    ctx.translate(cx, iconY);
    ctx.rotate((tick / 90) * Math.PI * 2); // 每 3 秒轉一圈
    ctx.fillText(icon, 0, 0);
    ctx.shadowBlur = 0;
  } else {
    ctx.fillText(icon, cx, iconY);
  }

  ctx.restore();
}

// ── Fallback rendering ──────────────────────────────────────

function drawHumanFallback(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, color: string, frame: number,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 14, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#F0C8A0";
  ctx.beginPath();
  ctx.arc(cx, cy - 8, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#333";
  ctx.fillRect(cx - 4, cy - 10, 2, 2);
  ctx.fillRect(cx + 3, cy - 10, 2, 2);
  const off = frame === 0 ? -2 : 2;
  ctx.fillStyle = "#F0C8A0";
  ctx.beginPath(); ctx.ellipse(cx - 15, cy + 6 + off, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 15, cy + 6 - off, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
}

function drawWafflesFallback(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, color: string, frame: number,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#C87F0A";
  ctx.beginPath(); ctx.moveTo(cx - 7, cy - 8); ctx.lineTo(cx - 12, cy - 18); ctx.lineTo(cx - 2, cy - 11); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 7, cy - 8); ctx.lineTo(cx + 12, cy - 18); ctx.lineTo(cx + 2, cy - 11); ctx.fill();
  ctx.fillStyle = "#333";
  ctx.fillRect(cx - 3, cy - 7, 2, 2);
  ctx.fillRect(cx + 2, cy - 7, 2, 2);
  const off = frame === 0 ? 1 : -1;
  ctx.fillStyle = "#C87F0A";
  ctx.beginPath(); ctx.ellipse(cx - 7, cy + 10 + off, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 7, cy + 10 - off, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
}
