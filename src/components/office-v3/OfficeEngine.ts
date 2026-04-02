// OfficeEngine.ts — 主迴圈：init 載入圖片 → start rAF → render
// 含公告欄/Boss 螢幕點擊事件、Waffles 點擊隨機動畫

import { CANVAS_W, CANVAS_H, TILE, TARGET_FPS, BULLETIN_BOARD, BOSS_SCREEN, setActiveWalkableMap } from "./officeData";
import { renderStaticScene, preloadMapObjects, getMapObj } from "./TileRenderer";
import { loadLayout, saveLayout, computeWalkableMap } from "./LayoutManager";
import type { OfficeLayout } from "./LayoutManager";
import { drawCharacter } from "./CharacterRenderer";
import { DialogueSystem } from "./DialogueSystem";
import { CharacterManager } from "./CharacterManager";
import { PIXELLAB_CHARACTERS, WAFFLES_ANIM_FRAMES, getWafflesFrame, V2_DIRS } from "./spriteAtlas";
import type { OsEntry } from "./OfficeCanvas";
import type { WafflesAnim } from "./spriteAtlas";

export interface EngineOptions {
  onCharacterClick?: (charId: string) => void;
  onDialogue?: (charId: string, text: string) => void;
  onBulletinClick?: () => void;
  onBossScreenClick?: () => void;
  onWafflesZoom?: (anim: WafflesAnim) => void;
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
  /** Unified image map for all v2 individual PNGs (key: "v2-{char}-{dir}", "v2-{char}-walk-{dir}-{frame}", etc.) */
  private v2Imgs: Record<string, HTMLImageElement> = {};
  private wafflesExtraImgs: Record<string, HTMLImageElement> = {};
  private tick = 0;
  private rafId: number | null = null;
  private lastT = 0;
  private readonly interval = 1000 / TARGET_FPS;

  // Layout reference (for editor)
  public layout: OfficeLayout | null = null;

  // Waffles click animation state (random anim on click)
  private wafflesClickAnim: WafflesAnim | null = null;
  private wafflesClickFrame = 0;
  private wafflesClickTimer = 0;
  private wafflesClickHold = 0; // ticks to hold last frame before clearing

  // Waffles click particles (hearts/stars)
  private wafflesParticles: Array<{
    x: number; y: number; vx: number; vy: number;
    life: number; maxLife: number; emoji: string;
  }> = [];

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions = {}) {
    this.canvas = canvas;
    this.opts = opts;

    // HiDPI / Retina support: scale canvas buffer by devicePixelRatio
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.scale(dpr, dpr);

    this.offscreen = document.createElement("canvas");
    this.offscreen.width = CANVAS_W;
    this.offscreen.height = CANVAS_H;
    this.offCtx = this.offscreen.getContext("2d")!;
    this.offCtx.imageSmoothingEnabled = false;

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
    // object-fit: contain 座標轉換
    const canvasAspect = CANVAS_W / CANVAS_H;
    const boxAspect = r.width / r.height;
    let renderW: number, renderH: number, offsetX: number, offsetY: number;
    if (boxAspect > canvasAspect) {
      renderH = r.height;
      renderW = r.height * canvasAspect;
      offsetX = (r.width - renderW) / 2;
      offsetY = 0;
    } else {
      renderW = r.width;
      renderH = r.width / canvasAspect;
      offsetX = 0;
      offsetY = 0;  // objectPosition: top — no vertical centering
    }
    const px = ((e.clientX - r.left - offsetX) / renderW) * CANVAS_W;
    const py = ((e.clientY - r.top - offsetY) / renderH) * CANVAS_H;

    // 公告欄點擊
    const bb = BULLETIN_BOARD;
    if (px >= bb.x * TILE && px <= (bb.x + bb.w) * TILE &&
        py >= bb.y * TILE && py <= (bb.y + bb.h) * TILE) {
      this.opts.onBulletinClick?.();
      return;
    }

    // Boss 桌子螢幕點擊
    const bs = BOSS_SCREEN;
    if (px >= bs.x * TILE && px <= (bs.x + bs.w) * TILE &&
        py >= bs.y * TILE && py <= (bs.y + bs.h) * TILE) {
      this.opts.onBossScreenClick?.();
      return;
    }

    const hit = this.mgr.findCharacterAt(px, py);
    if (hit) {
      if (hit.def.isWaffles) {
        // Waffles 隨機動畫
        const clickAnims: WafflesAnim[] = ["bark", "idle", "running", "sneaking", "walk"];
        this.wafflesClickAnim = clickAnims[Math.floor(Math.random() * clickAnims.length)];
        this.wafflesClickFrame = 0;
        this.wafflesClickTimer = 0;
        this.wafflesClickHold = 0;

        // Spawn particles around Waffles
        const particleEmojis = ["\u2764\uFE0F", "\u2B50", "\u2728", "\uD83D\uDC95", "\uD83C\uDF1F"];
        this.wafflesParticles = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.5;
          this.wafflesParticles.push({
            x: hit.px, y: hit.py - 40,
            vx: Math.cos(angle) * (1.5 + Math.random()),
            vy: Math.sin(angle) * (1.5 + Math.random()) - 1.5,
            life: 0,
            maxLife: 40 + Math.floor(Math.random() * 20),
            emoji: particleEmojis[Math.floor(Math.random() * particleEmojis.length)],
          });
        }

        // Notify overlay for zoomed Waffles animation
        this.opts.onWafflesZoom?.(this.wafflesClickAnim!);

        const waffleReactMap: Record<WafflesAnim, string> = {
          bark: "汪汪汪！",
          idle: "（發呆中...）",
          running: "（興奮亂跑！）",
          sneaking: "（偷偷摸摸...嘿嘿）",
          walk: "（散步中～）",
        };
        const text = waffleReactMap[this.wafflesClickAnim!];
        this.dlg.show(hit.def.id, text, hit.px, hit.py, this.tick);
      } else {
        const osList = this.memberOsData[hit.def.id];
        let osText: string;
        if (osList && osList.length > 0) {
          const idx = this.memberOsIndex[hit.def.id] ?? 0;
          const entry = osList[idx];
          osText = entry?.text ?? String(entry);
          this.memberOsIndex[hit.def.id] = (idx + 1) % osList.length;
        } else {
          const status = this.memberStatuses[hit.def.id];
          osText = status?.task || "\u5F85\u547D\u4E2D";
        }
        const info = osText;
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

    // Load v2 individual PNG sprites for all characters
    const plNames = Array.from(PIXELLAB_CHARACTERS);
    const dirs = Array.from(V2_DIRS);
    const v2Loads: Array<{ key: string; src: string }> = [];

    for (const n of plNames) {
      // Idle: 4 directions
      for (const d of dirs) {
        v2Loads.push({ key: `v2-${n}-${d}`, src: `/sprites/v2/${n}/${d}.png` });
      }
      // Walk: 4 directions x 4 frames
      for (const d of dirs) {
        for (let f = 0; f < 4; f++) {
          v2Loads.push({ key: `v2-${n}-walk-${d}-${f}`, src: `/sprites/v2/${n}/walk-${d}-${f}.png` });
        }
      }
      // Celebrate: south only, 4 frames
      for (let f = 0; f < 4; f++) {
        v2Loads.push({ key: `v2-${n}-celebrate-south-${f}`, src: `/sprites/v2/${n}/celebrate-south-${f}.png` });
      }
    }

    const v2Results = await Promise.allSettled(
      v2Loads.map((item) => load(item.src))
    );
    for (let i = 0; i < v2Loads.length; i++) {
      const r = v2Results[i];
      if (r.status === "fulfilled") this.v2Imgs[v2Loads[i].key] = r.value;
    }

    // Load Waffles extra animations
    const wafflesAnims: WafflesAnim[] = ["walk", "bark", "idle", "running", "sneaking"];
    const wafflesResults = await Promise.allSettled(
      wafflesAnims.map((a) => load(`/sprites/waffles-${a}.png`))
    );
    for (let i = 0; i < wafflesAnims.length; i++) {
      const r = wafflesResults[i];
      if (r.status === "fulfilled") this.wafflesExtraImgs[wafflesAnims[i]] = r.value;
    }

    await preloadMapObjects();

    // Load layout and compute walkable map
    try {
      this.layout = await loadLayout();
      const walkMap = computeWalkableMap(this.layout);
      setActiveWalkableMap(walkMap);
    } catch {
      // Fallback: no layout, renderStaticScene will use legacy path
      this.layout = null;
    }

    renderStaticScene(this.offCtx, this.tileImg, this.layout ?? undefined);
  }

  /** Re-render static scene (called after layout edits) */
  rerender() {
    if (this.layout) {
      const walkMap = computeWalkableMap(this.layout);
      setActiveWalkableMap(walkMap);
    }
    renderStaticScene(this.offCtx, this.tileImg, this.layout ?? undefined);
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
    const textOnly: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(osData)) {
      textOnly[k] = v.map((e) => e.text);
    }
    this.mgr.updateOs(textOnly);
  }

  /** Trigger celebrate animation for a character (called externally) */
  triggerCelebrate(charId: string) {
    this.mgr.triggerCelebrate(charId);
  }

  private loop = (now: number) => {
    const dt = now - this.lastT;
    if (dt >= this.interval) {
      this.lastT = now - (dt % this.interval);
      this.mgr.update(this.tick);
      this.dlg.update(this.tick);
      for (const c of this.mgr.characters) this.dlg.updatePosition(c.def.id, c.px, c.py);
      // Update Waffles click animation (slower: 8 ticks per frame, hold last frame 15 ticks)
      if (this.wafflesClickAnim) {
        const totalFrames = WAFFLES_ANIM_FRAMES[this.wafflesClickAnim] ?? 6;
        if (this.wafflesClickFrame >= totalFrames) {
          // Holding on last frame
          if (++this.wafflesClickHold >= 15) {
            this.wafflesClickAnim = null;
            this.wafflesClickFrame = 0;
            this.wafflesClickHold = 0;
          }
        } else if (++this.wafflesClickTimer >= 8) {
          this.wafflesClickFrame++;
          this.wafflesClickTimer = 0;
        }
      }
      // Update Waffles particles
      for (let i = this.wafflesParticles.length - 1; i >= 0; i--) {
        const p = this.wafflesParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03; // slight gravity
        p.life++;
        if (p.life >= p.maxLife) {
          this.wafflesParticles.splice(i, 1);
        }
      }
      this.render();
      this.tick++;
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private render() {
    const { ctx } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.offscreen, 0, 0);

    // 角色（依 y 排序模擬深度）
    const sorted = [...this.mgr.characters].sort((a, b) => a.py - b.py);
    for (const c of sorted) {
      // Waffles click animation override
      if (c.def.isWaffles && this.wafflesClickAnim) {
        const animImg = this.wafflesExtraImgs[this.wafflesClickAnim];
        if (animImg) {
          const dw = 180, dh = 180;
          const footY = c.py + 51;
          // Draw shadow
          ctx.fillStyle = "rgba(0,0,0,0.15)";
          ctx.beginPath();
          ctx.ellipse(c.px, footY - 2, dw / 2 - 4, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          // Draw click animation frame (clamp to last frame during hold)
          const clickTotalFrames = WAFFLES_ANIM_FRAMES[this.wafflesClickAnim] ?? 6;
          const displayFrame = Math.min(this.wafflesClickFrame, clickTotalFrames - 1);
          const f = getWafflesFrame(this.wafflesClickAnim, c.facing, displayFrame);
          ctx.drawImage(animImg, f.sx, f.sy, f.sw, f.sh, c.px - dw / 2, footY - dh, dw, dh);
          // Draw status icon (don't skip during animation)
          if (c.statusIcon) {
            const floatY = Math.sin((this.tick / 60) * Math.PI * 2) * 6;
            const emoteImg = getMapObj(c.statusIcon);
            if (emoteImg) {
              const maxSz = 48;
              const eAspect = emoteImg.naturalWidth / emoteImg.naturalHeight;
              const ew = eAspect >= 1 ? maxSz : maxSz * eAspect;
              const eh = eAspect >= 1 ? maxSz / eAspect : maxSz;
              ctx.drawImage(emoteImg, c.px - ew / 2, footY - dh - eh - 8 + floatY, ew, eh);
            } else {
              ctx.save();
              ctx.font = "56px serif";
              ctx.textAlign = "center";
              ctx.fillText(c.statusIcon, c.px, footY - dh - 12 + floatY);
              ctx.restore();
            }
          }
          continue;
        }
      }

      drawCharacter(
        ctx, c.px, c.py, c.def,
        {
          state: c.state,
          facing: c.facing,
          animFrame: c.animFrame,
          celebrateFrame: c.celebrateFrame,
          wafflesAnim: c.wafflesAnim,
          statusIcon: c.statusIcon,
          tick: this.tick,
        },
        this.charImg,
        this.v2Imgs,
        this.wafflesExtraImgs,
      );
    }

    // 名字標籤
    ctx.save();
    ctx.font = "20px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    ctx.textAlign = "left";
    for (const c of this.mgr.characters) {
      const label = c.def.nameCn || c.def.name;
      const nx = c.px + 40;
      const ny = c.py + 8;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(nx - 3, ny - 18, tw + 6, 24);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(label, nx, ny);
    }
    ctx.restore();

    // Waffles click particles
    if (this.wafflesParticles.length > 0) {
      ctx.save();
      ctx.font = "36px serif";
      ctx.textAlign = "center";
      for (const p of this.wafflesParticles) {
        const alpha = 1 - p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillText(p.emoji, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // 對話泡泡
    this.dlg.render(ctx, this.tick);
  }
}
