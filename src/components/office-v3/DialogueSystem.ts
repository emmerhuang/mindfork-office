// DialogueSystem.ts — 對話泡泡（漫畫風格氣泡 + 彎曲尾巴）
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
const FONT = "30px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";

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
    const pad = 7;
    const lineH = 38;
    const lines = wrapText(ctx, b.text, MAX_W - pad * 2);
    const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const bw = maxLineW + pad * 2;
    const bh = lines.length * lineH + pad * 2;
    const bx = Math.max(4, Math.min(b.cx - bw / 2, CANVAS_W - bw - 4));
    const by = b.cy - 150 - bh;

    // shadow
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;

    // comic bubble body (rounded rect + curved tail as one path)
    const r = 12;
    const triX = Math.max(bx + 16, Math.min(b.cx, bx + bw - 16));
    const tailW = 10;   // half-width of tail base
    const tailH = 14;   // tail length
    const tailCurve = 6; // bezier curve offset for comic feel

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    // top-left corner
    ctx.moveTo(bx + r, by);
    // top edge
    ctx.lineTo(bx + bw - r, by);
    // top-right corner
    ctx.arcTo(bx + bw, by, bx + bw, by + r, r);
    // right edge
    ctx.lineTo(bx + bw, by + bh - r);
    // bottom-right corner
    ctx.arcTo(bx + bw, by + bh, bx + bw - r, by + bh, r);
    // bottom edge — right of tail
    ctx.lineTo(triX + tailW, by + bh);
    // curved tail: right side down to tip, left side back up
    ctx.quadraticCurveTo(triX + tailCurve, by + bh + tailH * 0.4, triX, by + bh + tailH);
    ctx.quadraticCurveTo(triX - tailCurve, by + bh + tailH * 0.3, triX - tailW, by + bh);
    // bottom edge — left of tail
    ctx.lineTo(bx + r, by + bh);
    // bottom-left corner
    ctx.arcTo(bx, by + bh, bx, by + bh - r, r);
    // left edge
    ctx.lineTo(bx, by + r);
    // top-left corner
    ctx.arcTo(bx, by, bx + r, by, r);
    ctx.closePath();
    ctx.fill();

    // comic border (2px black outline)
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.stroke();

    // text (multi-line)
    ctx.fillStyle = "#222";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + pad, by + pad + lineH * 0.75 + i * lineH);
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
