// DialogueSystem.ts — 對話泡泡管理

export interface DialogueBubble {
  characterId: string;
  text: string;
  cx: number;          // 角色中心 x（像素）
  cy: number;          // 角色中心 y（像素）
  startTick: number;   // 開始顯示的 tick
  duration: number;    // 持續 ticks（30fps，= 秒 * 30）
}

const BUBBLE_DURATION_TICKS = 90; // 3 秒 @ 30fps
const FADE_TICKS = 20;            // 淡出時間

export class DialogueSystem {
  private bubbles: Map<string, DialogueBubble> = new Map();

  show(characterId: string, text: string, cx: number, cy: number, tick: number) {
    this.bubbles.set(characterId, {
      characterId,
      text,
      cx,
      cy,
      startTick: tick,
      duration: BUBBLE_DURATION_TICKS,
    });
  }

  update(tick: number) {
    for (const [id, bubble] of this.bubbles) {
      if (tick - bubble.startTick > bubble.duration) {
        this.bubbles.delete(id);
      }
    }
  }

  updatePosition(characterId: string, cx: number, cy: number) {
    const bubble = this.bubbles.get(characterId);
    if (bubble) {
      bubble.cx = cx;
      bubble.cy = cy;
    }
  }

  render(ctx: CanvasRenderingContext2D, tick: number) {
    for (const bubble of this.bubbles.values()) {
      const elapsed = tick - bubble.startTick;
      const remaining = bubble.duration - elapsed;

      // 計算 alpha（淡出）
      let alpha = 1;
      if (remaining < FADE_TICKS) {
        alpha = remaining / FADE_TICKS;
      }
      if (elapsed < 5) {
        alpha = elapsed / 5; // 淡入（5 幀）
      }

      this.renderBubble(ctx, bubble, alpha);
    }
  }

  private renderBubble(ctx: CanvasRenderingContext2D, bubble: DialogueBubble, alpha: number) {
    ctx.save();
    ctx.globalAlpha = alpha;

    const { cx, cy, text } = bubble;

    // 文字測量
    ctx.font = "bold 11px 'Courier New', monospace";
    const textW = ctx.measureText(text).width;
    const padding = { x: 8, y: 5 };
    const bubbleW = Math.min(textW + padding.x * 2, 220); // 最寬 220px
    const bubbleH = 24;

    // 如果文字太長，需要換行（簡化：直接截斷顯示）
    const displayText = text.length > 28 ? text.slice(0, 26) + "…" : text;
    const actualTextW = ctx.measureText(displayText).width;
    const actualBubbleW = actualTextW + padding.x * 2;

    // 泡泡位置（在角色頭頂）
    const bx = cx - actualBubbleW / 2;
    const by = cy - 44 - bubbleH;

    // 確保不超出畫布左右邊界
    const clampedBx = Math.max(4, Math.min(bx, 960 - actualBubbleW - 4));

    // 陰影
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;

    // 白色圓角矩形
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, clampedBx, by, actualBubbleW, bubbleH, 6);
    ctx.fill();

    // 邊框
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    roundRect(ctx, clampedBx, by, actualBubbleW, bubbleH, 6);
    ctx.stroke();

    // 小三角（指向角色）
    ctx.fillStyle = "#FFFFFF";
    const triangleCx = cx; // 三角指向角色中心
    const clampedTriX = Math.max(clampedBx + 8, Math.min(triangleCx, clampedBx + actualBubbleW - 8));
    ctx.beginPath();
    ctx.moveTo(clampedTriX - 5, by + bubbleH);
    ctx.lineTo(clampedTriX + 5, by + bubbleH);
    ctx.lineTo(clampedTriX, by + bubbleH + 6);
    ctx.closePath();
    ctx.fill();

    // 三角邊框（遮住矩形底邊）
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(clampedTriX - 5, by + bubbleH);
    ctx.lineTo(clampedTriX, by + bubbleH + 6);
    ctx.lineTo(clampedTriX + 5, by + bubbleH);
    ctx.stroke();

    // 蓋掉三角和矩形之間的線
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(clampedTriX - 4, by + bubbleH - 1, 8, 2);

    // 文字
    ctx.fillStyle = "#222222";
    ctx.font = "bold 10px 'Courier New', monospace";
    ctx.fillText(displayText, clampedBx + padding.x, by + bubbleH - padding.y);

    ctx.restore();
  }

  hasActiveBubble(characterId: string): boolean {
    return this.bubbles.has(characterId);
  }

  clear() {
    this.bubbles.clear();
  }
}

// ────────────────────────────────────────────────────────────
// 輔助：圓角矩形路徑
// ────────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number
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
