// DialogueSystem.ts — 對話泡泡（白色圓角矩形 + 三角指針）
import { CANVAS_W } from "./officeData";

interface Bubble {
  charId: string;
  text: string;
  cx: number; cy: number;
  startTick: number;
}

const DURATION = 120;   // 4 秒 @ 30fps
const FADE = 20;
const MAX_W = 350;
const FONT = "40px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";

export class DialogueSystem {
  private bubbles = new Map<string, Bubble>();

  show(charId: string, text: string, cx: number, cy: number, tick: number) {
    this.bubbles.set(charId, { charId, text, cx, cy, startTick: tick });
  }

  update(tick: number) {
    for (const [id, b] of this.bubbles) {
      if (tick - b.startTick > DURATION) this.bubbles.delete(id);
    }
  }

  updatePosition(charId: string, cx: number, cy: number) {
    const b = this.bubbles.get(charId);
    if (b) { b.cx = cx; b.cy = cy; }
  }

  render(ctx: CanvasRenderingContext2D, tick: number) {
    for (const b of this.bubbles.values()) {
      const elapsed = tick - b.startTick;
      const remain = DURATION - elapsed;
      let alpha = 1;
      if (elapsed < 5) alpha = elapsed / 5;
      if (remain < FADE) alpha = remain / FADE;
      this.draw(ctx, b, alpha);
    }
  }

  private draw(ctx: CanvasRenderingContext2D, b: Bubble, alpha: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = FONT;

    // 自動換行
    const pad = 10;
    const lineH = 48;
    const lines = wrapText(ctx, b.text, MAX_W - pad * 2);
    const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const bw = Math.min(maxLineW + pad * 2, MAX_W);
    const bh = lines.length * lineH + pad;
    const bx = Math.max(4, Math.min(b.cx - bw / 2, CANVAS_W - bw - 4));
    const by = b.cy - 50 - bh;

    // shadow
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    // bubble rect
    ctx.fillStyle = "#FFF";
    roundRect(ctx, bx, by, bw, bh, 6);
    ctx.fill();

    // border
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, 6);
    ctx.stroke();

    // triangle pointer
    const triX = Math.max(bx + 8, Math.min(b.cx, bx + bw - 8));
    ctx.fillStyle = "#FFF";
    ctx.beginPath();
    ctx.moveTo(triX - 5, by + bh);
    ctx.lineTo(triX + 5, by + bh);
    ctx.lineTo(triX, by + bh + 7);
    ctx.closePath();
    ctx.fill();

    // cover seam
    ctx.fillRect(triX - 4, by + bh - 1, 8, 2);

    // text (multi-line)
    ctx.fillStyle = "#222";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + pad, by + pad + 24 + i * lineH);
    }

    ctx.restore();
  }

  hasActiveBubble(charId: string) { return this.bubbles.has(charId); }
  clear() { this.bubbles.clear(); }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const result: string[] = [];
  // 先按 \n 拆段落
  for (const para of text.split("\n")) {
    if (!para) { result.push(""); continue; }
    // 再按寬度拆行
    let line = "";
    for (const ch of para.split("")) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line.length > 0) {
        result.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) result.push(line);
  }
  return result.length > 0 ? result : [""];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
