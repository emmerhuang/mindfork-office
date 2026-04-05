// CharacterRenderer.ts — 角色繪製（PixelLab walking/celebrate/idle sprites）

import { CharacterDef } from "./officeData";
import {
  CHAR_SPRITES, PIXELLAB_CHARACTERS, V2_FRAME_SIZE,
  getIdleKey, getWalkKey, getCelebrateKey, getWafflesFrame, getAtlasFrame,
  WafflesAnim,
} from "./spriteAtlas";
import type { AtlasMap } from "./spriteAtlas";
import { getMapObj } from "./TileRenderer";
import type { CharState } from "./CharacterManager";

// 顯示大小（依 sprite 來源分開，避免變形）
// V2 sprites 180x180 × 1.2 = 216x216
const PIXELLAB_W = 216, PIXELLAB_H = 216;
// V2 Waffles（柯基同比例放大）
const PIXELLAB_DOG_W = 216, PIXELLAB_DOG_H = 216;
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
  atlasMap: AtlasMap,
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

  const sz = V2_FRAME_SIZE; // 180 — full size of each individual PNG

  // --- Celebrate animation ---
  if (opts.state === "celebrating" && isPixelLab) {
    const celKey = getCelebrateKey(char.id, opts.celebrateFrame);
    const hit = getAtlasFrame(atlasMap, celKey, char.id);
    if (hit) {
      ctx.drawImage(hit.img, hit.frame.x, hit.frame.y, hit.frame.w, hit.frame.h, cx - dw / 2, footY - dh, dw, dh);
      drawStatusIcon(ctx, cx, footY - dh, opts.statusIcon, opts.tick);
      return;
    }
  }

  // --- Walking animation ---
  if (opts.state === "walking" && isPixelLab) {
    const walkKey = getWalkKey(char.id, opts.facing, opts.animFrame);
    const hit = getAtlasFrame(atlasMap, walkKey, char.id);
    if (hit) {
      ctx.drawImage(hit.img, hit.frame.x, hit.frame.y, hit.frame.w, hit.frame.h, cx - dw / 2, footY - dh, dw, dh);
      drawStatusIcon(ctx, cx, footY - dh, opts.statusIcon, opts.tick);
      return;
    }
  }

  // --- Idle / Working: static direction sprite ---
  if (isPixelLab) {
    const idleKey = getIdleKey(char.id, opts.facing);
    const hit = getAtlasFrame(atlasMap, idleKey, char.id);
    if (hit) {
      ctx.drawImage(hit.img, hit.frame.x, hit.frame.y, hit.frame.w, hit.frame.h, cx - dw / 2, footY - dh, dw, dh);
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
  // icon is now "emote-N" key referencing a preloaded PNG
  const emoteImg = getMapObj(icon);
  if (emoteImg) {
    // Draw at original aspect ratio, scaled to ~120px on the longer side
    const maxSide = 120;
    const aspect = emoteImg.naturalWidth / emoteImg.naturalHeight;
    const dw = aspect >= 1 ? maxSide : maxSide * aspect;
    const dh = aspect >= 1 ? maxSide / aspect : maxSide;
    const bounce = Math.abs(Math.sin((tick / 24) * Math.PI)) * 5;
    ctx.drawImage(emoteImg, cx - dw / 2, topY - dh + 22 - bounce, dw, dh);
  } else {
    // Fallback: render as text (for any non-emote icon strings)
    ctx.save();
    ctx.font = "56px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#000000";
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
    const bounce = Math.abs(Math.sin((tick / 24) * Math.PI)) * 5;
    ctx.fillText(icon, cx, topY - 2 - bounce);
    ctx.restore();
  }
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
