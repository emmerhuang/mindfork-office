// CharacterRenderer.ts — top-down 俯視角角色像素繪製

import { CharacterDef, TILE } from "./officeData";
import { CHAR_SPRITES, SpriteFrame } from "./spriteAtlas";

// ────────────────────────────────────────────────────────────
// 輔助：顏色調暗
// ────────────────────────────────────────────────────────────

function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.max(0, Math.round(r * (1 - amount)));
  const ng = Math.max(0, Math.round(g * (1 - amount)));
  const nb = Math.max(0, Math.round(b * (1 - amount)));
  return `rgb(${nr},${ng},${nb})`;
}

// ────────────────────────────────────────────────────────────
// 人形角色（top-down 俯視，約 18x18 px）
// ────────────────────────────────────────────────────────────

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number,          // 中心 x
  cy: number,          // 中心 y
  char: CharacterDef,
  animFrame: number,   // 0 or 1，用於打字/走路動畫
  isSleeping?: boolean,
  dimAlpha?: number,   // 0-1，sleeping 時調暗
  charImg?: HTMLImageElement | null
) {
  ctx.save();

  if (isSleeping) {
    ctx.globalAlpha = dimAlpha ?? 0.5;
  }

  // 嘗試用 sprite 繪製
  const spriteSet = CHAR_SPRITES[char.id];
  if (charImg && spriteSet) {
    const frames = spriteSet.front;
    const frame = frames[animFrame % frames.length];
    const dw = char.isWaffles ? 48 : 48;
    const dh = char.isWaffles ? 44 : 64;

    // 地面陰影
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + dh / 2 - 2, dw / 2 - 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // sprite
    ctx.drawImage(
      charImg,
      frame.sx, frame.sy, frame.sw, frame.sh,
      cx - dw / 2, cy - dh / 2, dw, dh
    );
  } else if (char.isWaffles) {
    // fallback 程式化繪製
    drawWaffles(ctx, cx, cy, char.color, animFrame, isSleeping);
  } else {
    drawHuman(ctx, cx, cy, char.color, char.skinColor, animFrame);
  }

  ctx.restore();
}

function drawHuman(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bodyColor: string,
  skinColor: string,
  animFrame: number
) {
  // 地面陰影
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 14, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 身體（橢圓，主色）
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // 身體輪廓
  ctx.strokeStyle = darken(bodyColor, 0.3);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 10, 8, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 頭部（圓形，膚色）
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(cx, cy - 4, 9, 0, Math.PI * 2);
  ctx.fill();

  // 頭部輪廓
  ctx.strokeStyle = darken(skinColor, 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy - 4, 9, 0, Math.PI * 2);
  ctx.stroke();

  // 眼睛（兩個小點）
  ctx.fillStyle = "#333333";
  ctx.fillRect(cx - 3, cy - 6, 2, 2);
  ctx.fillRect(cx + 2, cy - 6, 2, 2);

  // 手臂（打字動畫）
  const armOffset = animFrame === 0 ? -2 : 2;
  ctx.fillStyle = skinColor;
  // 左手
  ctx.beginPath();
  ctx.ellipse(cx - 11, cy + 3 + armOffset, 3.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // 右手
  ctx.beginPath();
  ctx.ellipse(cx + 11, cy + 3 - armOffset, 3.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // 頭髮/帽子（用角色主色，上半圓）
  ctx.fillStyle = darken(bodyColor, 0.15);
  ctx.beginPath();
  ctx.arc(cx, cy - 9, 7, Math.PI, 0);
  ctx.fill();
}

function drawWaffles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  animFrame: number,
  isSleeping?: boolean
) {
  if (isSleeping) {
    // 趴平狀態（橢圓形）
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 地面陰影
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 9, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // 身體（橫向橢圓）
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 身體輪廓
  ctx.strokeStyle = darken(color, 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 8, 5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 頭（從身體前方延伸）
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 5, 0, Math.PI * 2);
  ctx.fill();

  // 耳朵（三角形，深橘色）
  const earColor = darken(color, 0.3);
  ctx.fillStyle = earColor;
  // 左耳
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 4);
  ctx.lineTo(cx - 9, cy - 10);
  ctx.lineTo(cx - 2, cy - 7);
  ctx.closePath();
  ctx.fill();
  // 右耳
  ctx.beginPath();
  ctx.moveTo(cx + 5, cy - 4);
  ctx.lineTo(cx + 9, cy - 10);
  ctx.lineTo(cx + 2, cy - 7);
  ctx.closePath();
  ctx.fill();

  // 眼睛
  ctx.fillStyle = "#333333";
  ctx.fillRect(cx - 2, cy - 3, 2, 2);
  ctx.fillRect(cx + 1, cy - 3, 2, 2);

  // 鼻子（小黑點）
  ctx.fillStyle = "#222222";
  ctx.fillRect(cx - 1, cy, 2, 1.5);

  // 腳（走路動畫）
  const legOffsetA = animFrame === 0 ? 1 : -1;
  ctx.fillStyle = darken(color, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx - 5, cy + 8 + legOffsetA, 2.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, cy + 8 - legOffsetA, 2.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // 尾巴（搖擺）
  const tailAngle = animFrame === 0 ? 0.5 : -0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + 7, cy + 2);
  ctx.quadraticCurveTo(
    cx + 12 + Math.cos(tailAngle) * 4,
    cy - 4 + Math.sin(tailAngle) * 4,
    cx + 10,
    cy - 8
  );
  ctx.stroke();
}

// ────────────────────────────────────────────────────────────
// ZZZ 睡眠泡泡
// ────────────────────────────────────────────────────────────

export function drawZZZ(ctx: CanvasRenderingContext2D, cx: number, cy: number, tick: number) {
  ctx.save();
  const phase = (tick % 60) / 60; // 0-1，每 60 幀一個循環（30fps = 2秒）

  const letters = ["z", "z", "Z"];
  const offsets = [
    { x: 0, y: 0, size: 8 },
    { x: 6, y: -6, size: 10 },
    { x: 13, y: -13, size: 13 },
  ];

  for (let i = 0; i < letters.length; i++) {
    const { x, y, size } = offsets[i];
    // 每個 Z 有不同相位
    const alpha = Math.max(0, Math.sin((phase + i * 0.25) * Math.PI));
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = "#6699CC";
    ctx.font = `bold ${size}px monospace`;
    ctx.fillText(letters[i], cx + x - 8, cy + y - 16);
  }

  ctx.restore();
}
