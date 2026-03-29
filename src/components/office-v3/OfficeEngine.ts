// OfficeEngine.ts — 主迴圈：init 載入圖片 → start rAF → render

import { CANVAS_W, CANVAS_H, TARGET_FPS } from "./officeData";
import { renderStaticScene } from "./TileRenderer";
import { drawCharacter } from "./CharacterRenderer";
import { DialogueSystem } from "./DialogueSystem";
import { CharacterManager } from "./CharacterManager";

export interface EngineOptions {
  onCharacterClick?: (charId: string) => void;
  onDialogue?: (charId: string, text: string) => void;
}

export class OfficeEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private dlg: DialogueSystem;
  private mgr: CharacterManager;
  private opts: EngineOptions;
  private charImg: HTMLImageElement | null = null;
  private tileImg: HTMLImageElement | null = null;
  private tick = 0;
  private rafId: number | null = null;
  private lastT = 0;
  private readonly interval = 1000 / TARGET_FPS;

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.opts = opts;

    this.offscreen = document.createElement("canvas");
    this.offscreen.width = CANVAS_W;
    this.offscreen.height = CANVAS_H;
    this.offCtx = this.offscreen.getContext("2d")!;

    this.dlg = new DialogueSystem();
    this.mgr = new CharacterManager((id, text) => {
      const c = this.mgr.characters.find((ch) => ch.def.id === id);
      if (c) this.dlg.show(id, text, c.px, c.py, this.tick);
      opts.onDialogue?.(id, text);
    });

    this.canvas.addEventListener("click", this.onClick);
  }

  private onClick = (e: MouseEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (CANVAS_W / r.width);
    const py = (e.clientY - r.top) * (CANVAS_H / r.height);
    const hit = this.mgr.findCharacterAt(px, py);
    if (hit) {
      const pool = hit.def.dialogues;
      if (pool.length) this.dlg.show(hit.def.id, pool[Math.floor(Math.random() * pool.length)], hit.px, hit.py, this.tick);
      this.opts.onCharacterClick?.(hit.def.id);
    }
  };

  async init() {
    const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src;
    });
    try {
      [this.charImg, this.tileImg] = await Promise.all([
        load("/sprites/characters-clean.png"),
        load("/sprites/tileset-clean.png"),
      ]);
    } catch { /* fallback to programmatic rendering */ }
    renderStaticScene(this.offCtx, this.tileImg);
  }

  start() { this.lastT = performance.now(); this.rafId = requestAnimationFrame(this.loop); }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.canvas.removeEventListener("click", this.onClick);
  }

  updateStatuses(data: Record<string, { status: string; task: string }>) {
    this.mgr.updateStatuses(data);
  }

  updateMemberOs(osData: Record<string, string>) {
    this.mgr.updateOs(osData);
  }

  private loop = (now: number) => {
    const dt = now - this.lastT;
    if (dt >= this.interval) {
      this.lastT = now - (dt % this.interval);
      this.mgr.update(this.tick);
      this.dlg.update(this.tick);
      for (const c of this.mgr.characters) this.dlg.updatePosition(c.def.id, c.px, c.py);
      this.render();
      this.tick++;
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private render() {
    const { ctx } = this;
    ctx.drawImage(this.offscreen, 0, 0);

    // 角色（依 y 排序模擬深度）
    const sorted = [...this.mgr.characters].sort((a, b) => a.py - b.py);
    for (const c of sorted) {
      drawCharacter(ctx, c.px, c.py, c.def, c.animFrame, this.charImg);
    }

    // 名字標籤
    ctx.save();
    ctx.font = "20px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    ctx.textAlign = "left";
    for (const c of this.mgr.characters) {
      const label = c.def.nameCn || c.def.name;
      const nx = c.px + 30;
      const ny = c.py + 30;
      const tw = ctx.measureText(label).width;
      // 底色背景
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(nx - 3, ny - 16, tw + 6, 22);
      // 文字
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(label, nx, ny);
    }
    ctx.restore();

    // 對話泡泡
    this.dlg.render(ctx, this.tick);
  }
}
