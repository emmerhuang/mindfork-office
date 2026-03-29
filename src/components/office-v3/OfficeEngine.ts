// OfficeEngine.ts — requestAnimationFrame 主迴圈
// 整合 TileRenderer、CharacterManager、DialogueSystem 的協調者

import { CANVAS_W, CANVAS_H, TARGET_FPS } from "./officeData";
import { renderStaticScene } from "./TileRenderer";
import { drawCharacter, drawZZZ } from "./CharacterRenderer";
import { DialogueSystem } from "./DialogueSystem";
import { CharacterManager } from "./CharacterManager";

// ────────────────────────────────────────────────────────────
// 型別
// ────────────────────────────────────────────────────────────

export interface EngineOptions {
  onDialogue?: (charId: string, text: string, cx: number, cy: number) => void;
  onCharacterClick?: (charId: string) => void;
}

// ────────────────────────────────────────────────────────────
// OfficeEngine
// ────────────────────────────────────────────────────────────

export class OfficeEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private staticCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;

  private dialogueSystem: DialogueSystem;
  private characterManager: CharacterManager;
  private options: EngineOptions;

  private charImg: HTMLImageElement | null = null;
  private tileImg: HTMLImageElement | null = null;

  private tick = 0;
  private rafId: number | null = null;
  private lastTime = 0;
  private readonly frameInterval = 1000 / TARGET_FPS;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot get 2d context");
    this.ctx = ctx;
    this.options = options;

    // Offscreen canvas for static scene（只繪製一次）
    this.staticCanvas = document.createElement("canvas");
    this.staticCanvas.width = CANVAS_W;
    this.staticCanvas.height = CANVAS_H;
    const staticCtx = this.staticCanvas.getContext("2d");
    if (!staticCtx) throw new Error("Cannot get offscreen 2d context");
    this.staticCtx = staticCtx;

    // 系統初始化
    this.dialogueSystem = new DialogueSystem();
    this.characterManager = new CharacterManager((charId, text) => {
      // 取得角色目前像素位置
      const char = this.characterManager.characters.find(
        (c) => c.def.id === charId
      );
      if (!char) return;
      this.dialogueSystem.show(charId, text, char.px, char.py, this.tick);
      options.onDialogue?.(charId, text, char.px, char.py);
    });

    // 點擊偵測
    this.canvas.addEventListener("click", this.handleClick);
  }

  private handleClick = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    // 將螢幕座標轉換為 canvas 邏輯座標（考慮縮放）
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    const found = this.characterManager.findCharacterAt(px, py);
    if (found) {
      // 立即觸發一句台詞
      const pool = found.def.dialogues;
      if (pool && pool.length > 0) {
        const text = pool[Math.floor(Math.random() * pool.length)];
        this.dialogueSystem.show(found.def.id, text, found.px, found.py, this.tick);
      }
      this.options.onCharacterClick?.(found.def.id);
    }
  };

  async init() {
    // 載入 sprite 圖片（失敗時不阻塞，fallback 用程式化繪製）
    try {
      const [charImg, tileImg] = await Promise.all([
        this.loadImage("/sprites/characters-clean.png"),
        this.loadImage("/sprites/tileset-clean.png"),
      ]);
      this.charImg = charImg;
      this.tileImg = tileImg;
    } catch {
      // 圖片載入失敗，保持 null，render 時走 fallback
    }

    // 預渲染靜態場景（有 tileImg 時用 sprite，否則 fallback）
    renderStaticScene(this.staticCtx, this.tileImg);
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  start() {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.canvas.removeEventListener("click", this.handleClick);
  }

  updateStatuses(data: Record<string, { status: string; task: string }>) {
    this.characterManager.updateStatuses(data);
  }

  // ────────────────────────────────────────────────────────────
  // 主迴圈
  // ────────────────────────────────────────────────────────────

  private loop = (now: number) => {
    const elapsed = now - this.lastTime;

    if (elapsed >= this.frameInterval) {
      this.lastTime = now - (elapsed % this.frameInterval);
      this.update();
      this.render();
      this.tick++;
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private update() {
    this.characterManager.update(this.tick);
    this.dialogueSystem.update(this.tick);

    // 同步更新泡泡位置（角色走動時泡泡跟著走）
    for (const char of this.characterManager.characters) {
      this.dialogueSystem.updatePosition(char.def.id, char.px, char.py);
    }
  }

  private render() {
    const { ctx } = this;

    // 1. 貼靜態場景（offscreen → main canvas）
    ctx.drawImage(this.staticCanvas, 0, 0);

    // 2. 繪製所有角色
    for (const char of this.characterManager.characters) {
      const isSleeping = char.state === "idle_away";
      drawCharacter(ctx, char.px, char.py, char.def, char.animFrame, false, undefined, this.charImg);

      // 睡眠 ZZZ（在茶水間/會議室的角色顯示思考泡泡）
      if (isSleeping) {
        drawZZZ(ctx, char.px, char.py, this.tick);
      }
    }

    // 3. 角色名稱標籤（小字，桌子上方）
    this.renderNameLabels();

    // 4. 對話泡泡（最頂層）
    this.dialogueSystem.render(ctx, this.tick);
  }

  private renderNameLabels() {
    const { ctx } = this;
    ctx.save();
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.textAlign = "center";

    for (const char of this.characterManager.characters) {
      const label = char.def.nameCn || char.def.name;

      // 文字陰影（可讀性）
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(label, char.px + 1, char.py - 39);

      ctx.fillStyle = "#333333";
      ctx.fillText(label, char.px, char.py - 40);
    }

    ctx.textAlign = "left";
    ctx.restore();
  }
}
