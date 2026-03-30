// OfficeEngine.ts — 主迴圈：init 載入圖片 → start rAF → render

import { CANVAS_W, CANVAS_H, TILE, TARGET_FPS } from "./officeData";
import { renderStaticScene } from "./TileRenderer";
import { drawCharacter } from "./CharacterRenderer";
import { DialogueSystem } from "./DialogueSystem";
import { CharacterManager } from "./CharacterManager";
import { PIXELLAB_CHARACTERS } from "./spriteAtlas";
import type { OsEntry } from "./OfficeCanvas";

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
  private pixelLabImgs: Record<string, HTMLImageElement> = {};
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
    // object-fit: contain 的正確座標轉換
    const canvasAspect = CANVAS_W / CANVAS_H;
    const boxAspect = r.width / r.height;
    let renderW: number, renderH: number, offsetX: number, offsetY: number;
    if (boxAspect > canvasAspect) {
      // 上下填滿，左右有留白
      renderH = r.height;
      renderW = r.height * canvasAspect;
      offsetX = (r.width - renderW) / 2;
      offsetY = 0;
    } else {
      // 左右填滿，上下有留白
      renderW = r.width;
      renderH = r.width / canvasAspect;
      offsetX = 0;
      offsetY = (r.height - renderH) / 2;
    }
    const px = ((e.clientX - r.left - offsetX) / renderW) * CANVAS_W;
    const py = ((e.clientY - r.top - offsetY) / renderH) * CANVAS_H;
    // 書櫃點擊（牆面區域 y < TILE*3，書架在左右兩端）
    if (py < TILE * 3 && (px < TILE * 2 || px > CANVAS_W - TILE * 2)) {
      const projects = [
        "rotaryCredit — 扶輪信用稽核預警系統",
        "account-rotary — 扶輪會計系統",
        "WaHoot Rotary — 互動問答系統",
        "rotarysso — 扶輪 SSO 單一登入",
      ];
      this.dlg.show("bookshelf", "📚 已完成專案：\n" + projects.join("\n"), CANVAS_W / 2, TILE * 4, this.tick);
      return;
    }

    const hit = this.mgr.findCharacterAt(px, py);
    if (hit) {
      if (hit.def.isWaffles) {
        // Waffles 特殊反應：快速搖動 + 特殊台詞
        const waffleReacts = ["汪汪汪！（好開心被摸！）", "（翻肚）再摸一次！", "（瘋狂搖尾巴）", "汪！你好你好！", "（舔手）嘿嘿～"];
        const text = waffleReacts[Math.floor(Math.random() * waffleReacts.length)];
        this.dlg.show(hit.def.id, text, hit.px, hit.py, this.tick);
        // 快速切換動畫模擬搖擺
        hit.animFrame = 0;
        hit.animTimer = 0;
        const origTick = hit.animTimer;
        let count = 0;
        const wag = setInterval(() => {
          hit.animFrame ^= 1;
          if (++count > 8) { clearInterval(wag); hit.animTimer = origTick; }
        }, 100);
      } else {
        // 顯示角色資訊 + OS 輪播
        const osList = this.memberOsData[hit.def.id];
        let osText: string;
        if (osList && osList.length > 0) {
          const idx = this.memberOsIndex[hit.def.id] ?? 0;
          const entry = osList[idx];
          osText = entry?.text ?? String(entry);
          // 下次點擊顯示下一筆（循環）
          this.memberOsIndex[hit.def.id] = (idx + 1) % osList.length;
        } else {
          const status = this.memberStatuses[hit.def.id];
          osText = status?.task || "待命中";
        }
        const info = `${hit.def.nameCn}（${hit.def.role}）\n"${osText}"`;
        this.dlg.show(hit.def.id, info, hit.px, hit.py, this.tick);
      }
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
    // Load PixelLab character sprite sheets
    const plNames = Array.from(PIXELLAB_CHARACTERS);
    const plResults = await Promise.allSettled(
      plNames.map((n) => load(`/sprites/${n}-pixellab.png`))
    );
    for (let i = 0; i < plNames.length; i++) {
      const r = plResults[i];
      if (r.status === "fulfilled") this.pixelLabImgs[plNames[i]] = r.value;
    }
    renderStaticScene(this.offCtx, this.tileImg);
  }

  start() { this.lastT = performance.now(); this.rafId = requestAnimationFrame(this.loop); }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.canvas.removeEventListener("click", this.onClick);
  }

  private memberStatuses: Record<string, { status: string; task: string }> = {};
  private memberOsData: Record<string, OsEntry[]> = {};
  private memberOsIndex: Record<string, number> = {};

  updateStatuses(data: Record<string, { status: string; task: string }>) {
    this.memberStatuses = data;
    this.mgr.updateStatuses(data);
  }

  updateMemberOs(osData: Record<string, OsEntry[]>) {
    this.memberOsData = osData;
    // Pass text-only array to CharacterManager for dialogue
    const textOnly: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(osData)) {
      textOnly[k] = v.map((e) => e.text);
    }
    this.mgr.updateOs(textOnly);
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
      drawCharacter(ctx, c.px, c.py, c.def, c.animFrame, this.charImg, this.pixelLabImgs, c.facing);
    }

    // 名字標籤
    ctx.save();
    ctx.font = "38px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    ctx.textAlign = "left";
    for (const c of this.mgr.characters) {
      const label = c.def.nameCn || c.def.name;
      const nx = c.px + 50;
      const ny = c.py + 60;
      const tw = ctx.measureText(label).width;
      // 底色背景
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(nx - 3, ny - 34, tw + 6, 42);
      // 文字
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(label, nx, ny);
    }
    ctx.restore();

    // 對話泡泡
    this.dlg.render(ctx, this.tick);
  }
}
