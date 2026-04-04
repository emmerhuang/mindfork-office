// DialogueSystem.ts — 對話泡泡（漫畫風格氣泡 + 彎曲尾巴）
import { CANVAS_W } from "./officeData";

interface Bubble {
  charId: string;
  text: string;
  cx: number; cy: number;
  startTick: number;
  duration: number;       // ticks before bubble disappears
  scale: number;          // font/bubble scale (1.0 = normal, 1.3 = collision)
}

/** Shared conversation bubble displayed between two characters */
interface ConversationBubble {
  speakerName: string;
  speakerColor: string;
  text: string;
  cx: number; cy: number;         // center position (midpoint between chars)
  arrowX: number;                 // arrow tip X (points to current speaker)
  startTick: number;
  duration: number;
  scale: number;
}

const DURATION = 120;   // 4 秒 @ 30fps
const FADE = 20;
const MAX_W = 350;
const FONT = "30px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";

export class DialogueSystem {
  private bubbles = new Map<string, Bubble>();
  private convBubble: ConversationBubble | null = null;

  show(charId: string, text: string, cx: number, cy: number, tick: number, duration?: number) {
    this.bubbles.set(charId, { charId, text, cx, cy, startTick: tick, duration: duration ?? DURATION, scale: 1.0 });
  }

  /** Show a collision dialogue bubble (1.3x larger text) */
  showCollision(charId: string, text: string, cx: number, cy: number, tick: number, duration?: number) {
    this.bubbles.set(charId, { charId, text, cx, cy, startTick: tick, duration: duration ?? DURATION, scale: 1.3 });
  }

  /** Show a shared conversation bubble between two characters.
   *  The bubble appears at the midpoint; arrow points toward the speaker. */
  showConversation(
    ax: number, ay: number,
    bx: number, by: number,
    speakerName: string,
    speakerColor: string,
    text: string,
    speaker: "A" | "B",
    tick: number,
    duration?: number,
  ) {
    const midX = (ax + bx) / 2;
    const midY = Math.min(ay, by);
    const arrowX = speaker === "A" ? ax : bx;
    this.convBubble = {
      speakerName,
      speakerColor,
      text,
      cx: midX,
      cy: midY,
      arrowX,
      startTick: tick,
      duration: duration ?? 75,
      scale: 1.5,
    };
  }

  /** Clear the shared conversation bubble */
  clearConversation() {
    this.convBubble = null;
  }

  update(tick: number) {
    for (const [id, b] of this.bubbles) {
      if (tick - b.startTick > b.duration) this.bubbles.delete(id);
    }
    if (this.convBubble && tick - this.convBubble.startTick > this.convBubble.duration) {
      this.convBubble = null;
    }
  }

  updatePosition(charId: string, cx: number, cy: number) {
    const b = this.bubbles.get(charId);
    if (b) { b.cx = cx; b.cy = cy; }
  }

  render(ctx: CanvasRenderingContext2D, tick: number) {
    for (const b of this.bubbles.values()) {
      const elapsed = tick - b.startTick;
      const remain = b.duration - elapsed;
      let alpha = 1;
      if (elapsed < 5) alpha = elapsed / 5;
      if (remain < FADE) alpha = remain / FADE;
      this.draw(ctx, b, alpha);
    }
    // Render shared conversation bubble on top
    if (this.convBubble) {
      const cb = this.convBubble;
      const elapsed = tick - cb.startTick;
      const remain = cb.duration - elapsed;
      let alpha = 1;
      if (elapsed < 5) alpha = elapsed / 5;
      if (remain < FADE) alpha = remain / FADE;
      this.drawConversation(ctx, cb, alpha);
    }
  }

  private draw(ctx: CanvasRenderingContext2D, b: Bubble, alpha: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = b.scale ?? 1.0;
    const fontSize = Math.round(30 * s);
    ctx.font = `${fontSize}px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif`;

    // 自動換行
    const pad = Math.round(7 * s);
    const lineH = Math.round(38 * s);
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

  /** Draw shared conversation bubble (centered between two characters) */
  private drawConversation(ctx: CanvasRenderingContext2D, cb: ConversationBubble, alpha: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = cb.scale;
    const fontSize = Math.round(30 * s);
    const nameFontSize = Math.round(28 * s);
    ctx.font = `${fontSize}px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif`;

    // Measure name prefix and full text
    const namePrefix = `${cb.speakerName}：`;
    const pad = Math.round(10 * s);
    const lineH = Math.round(40 * s);

    // Wrap with name prefix on first line
    ctx.font = `bold ${nameFontSize}px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif`;
    const nameW = ctx.measureText(namePrefix).width;
    ctx.font = `${fontSize}px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif`;

    const maxBubbleW = 420;
    const contentMaxW = maxBubbleW - pad * 2;
    const lines = wrapTextWithPrefix(ctx, cb.text, contentMaxW, nameW);
    const maxLineW = Math.max(
      nameW + ctx.measureText(lines[0] || "").width,
      ...lines.slice(1).map(l => ctx.measureText(l).width)
    );
    const bw = Math.min(maxLineW + pad * 2, maxBubbleW);
    const bh = lines.length * lineH + pad * 2;
    const bx = Math.max(4, Math.min(cb.cx - bw / 2, CANVAS_W - bw - 4));
    const by = cb.cy - 160 - bh;

    // shadow
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    // Bubble body (rounded rect)
    const r = 14;
    const triX = Math.max(bx + 20, Math.min(cb.arrowX, bx + bw - 20));
    const tailW = 12;
    const tailH = 16;
    const tailCurve = 7;

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + r, r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.arcTo(bx + bw, by + bh, bx + bw - r, by + bh, r);
    ctx.lineTo(triX + tailW, by + bh);
    ctx.quadraticCurveTo(triX + tailCurve, by + bh + tailH * 0.4, triX, by + bh + tailH);
    ctx.quadraticCurveTo(triX - tailCurve, by + bh + tailH * 0.3, triX - tailW, by + bh);
    ctx.lineTo(bx + r, by + bh);
    ctx.arcTo(bx, by + bh, bx, by + bh - r, r);
    ctx.lineTo(bx, by + r);
    ctx.arcTo(bx, by, bx + r, by, r);
    ctx.closePath();
    ctx.fill();

    // Border
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Text: name in color + bold, body in black
    const textX = bx + pad;
    const textY = by + pad + lineH * 0.75;

    // First line: name prefix + first text line
    ctx.font = `bold ${nameFontSize}px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif`;
    ctx.fillStyle = cb.speakerColor;
    ctx.fillText(namePrefix, textX, textY);

    ctx.font = `${fontSize}px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif`;
    ctx.fillStyle = "#222";
    ctx.fillText(lines[0] || "", textX + nameW, textY);

    // Remaining lines
    for (let i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i], textX, textY + i * lineH);
    }

    ctx.restore();
  }

  hasActiveBubble(charId: string) { return this.bubbles.has(charId); }
  hasActiveConversation() { return this.convBubble !== null; }
  clear() { this.bubbles.clear(); this.convBubble = null; }
}

/** Wrap text accounting for a name prefix on the first line.
 *  First line has reduced width (maxW - prefixW), subsequent lines use full maxW. */
function wrapTextWithPrefix(ctx: CanvasRenderingContext2D, text: string, maxW: number, prefixW: number): string[] {
  const result: string[] = [];
  const firstLineMax = maxW - prefixW;
  let isFirstLine = true;
  for (const para of text.split("\n")) {
    if (!para) { result.push(""); isFirstLine = false; continue; }
    let line = "";
    const lineMax = isFirstLine ? firstLineMax : maxW;
    for (const ch of para.split("")) {
      const test = line + ch;
      if (ctx.measureText(test).width > lineMax && line.length > 0) {
        result.push(line);
        line = ch;
        if (isFirstLine) isFirstLine = false;
      } else {
        line = test;
      }
    }
    if (line) { result.push(line); if (isFirstLine) isFirstLine = false; }
  }
  return result.length > 0 ? result : [""];
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
