// OfficeEngine.ts — 主迴圈：init 載入圖片 → start rAF → render
// 含公告欄/Boss 螢幕點擊事件、Waffles 點擊隨機動畫

import { CANVAS_W, CANVAS_H, TILE, TARGET_FPS, BULLETIN_BOARD, BOSS_SCREEN, CHARACTERS, setActiveWalkableMap, updateCharacterPositions } from "./officeData";
import { renderStaticScene, preloadMapObjects, getMapObj } from "./TileRenderer";
import { loadLayout, saveLayout, computeWalkableMap } from "./LayoutManager";
import type { OfficeLayout } from "./LayoutManager";
import { drawCharacter } from "./CharacterRenderer";
import { DialogueSystem } from "./DialogueSystem";
import { CharacterManager } from "./CharacterManager";
import { PIXELLAB_CHARACTERS, WAFFLES_ANIM_FRAMES, CELEBRATE_FRAME_COUNTS, getWafflesFrame, V2_DIRS } from "./spriteAtlas";
import type { AtlasMap, AtlasFrame } from "./spriteAtlas";
import type { OsEntry } from "./OfficeCanvas";
import type { WafflesAnim } from "./spriteAtlas";

const rand = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

export interface ConvBarData {
  charAId: string;
  charBId: string;
  charAName: string;
  charBName: string;
  charARole: string;
  charBRole: string;
  charAColor: string;
  charBColor: string;
  speaker: "A" | "B";
  text: string;
}

export interface EngineOptions {
  onCharacterClick?: (charId: string) => void;
  onDialogue?: (charId: string, text: string) => void;
  onBulletinClick?: () => void;
  onBossScreenClick?: () => void;
  onWafflesZoom?: (anim: WafflesAnim, dir?: string) => void;
  onConversationBar?: (data: ConvBarData | null) => void;
  onChatroomClick?: () => void;
}

// ── Interaction Zones (2026-04-22 Phase B P2-1) ──────────────
// Layout objects whose `special` starts with "trigger-" are treated as
// clickable interaction zones. This table centralises the mapping from
// the `special` string (kept for layout-JSON back-compat) to a typed
// handler, so the click dispatcher is a single loop instead of a
// cascade of string comparisons.
//
// To add a new zone type:
//   1. Extend `InteractionZoneType` with the new literal.
//   2. Add a `{ special, type }` row to INTERACTION_ZONE_SPECS.
//   3. Add an EngineOptions callback + route it in `dispatchZoneClick`.
//   4. (optional) Add a legacy bbox fallback in onClick.
export type InteractionZoneType = "chatroom" | "bulletin" | "dashboard";

interface InteractionZoneSpec {
  /** Layout object `special` string — stays as-is for back-compat. */
  special: string;
  type: InteractionZoneType;
}

const INTERACTION_ZONE_SPECS: InteractionZoneSpec[] = [
  { special: "trigger-bulletin", type: "bulletin" },
  { special: "trigger-dashboard", type: "dashboard" },
  { special: "trigger-chatroom", type: "chatroom" },
];

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
  /** Atlas map: per-character atlas image + frame lookup (replaces individual PNGs) */
  private atlasMap: AtlasMap = {};
  private wafflesExtraImgs: Record<string, HTMLImageElement> = {};
  private tick = 0;
  private rafId: number | null = null;
  private lastT = 0;
  private readonly interval = 1000 / TARGET_FPS;

  // Layout reference (for editor)
  public layout: OfficeLayout | null = null;
  // Editor mode: pause character updates
  public editorMode = false;

  // Waffles click animation state (random anim on click)
  private wafflesClickAnim: WafflesAnim | null = null;
  private wafflesExcitedDir: string = "south"; // direction for v2 excited animation
  private wafflesClickFrame = 0;
  private wafflesClickTimer = 0;
  private wafflesClickHold = 0; // ticks to hold last frame before clearing

  // Waffles click particles (hearts/stars)
  private wafflesParticles: Array<{
    x: number; y: number; vx: number; vy: number;
    life: number; maxLife: number; emoji: string;
  }> = [];

  // ── Phase B P2-3 (2026-04-22): zone-step dialogue ─────────────
  // Chat channel summaries (channel_id -> messages), fed from React.
  private chatSummariesByChannel: Record<string, {
    participant_a: string;
    participant_b: string;
    messages: Array<{ sender: string; content: string; created_at: string }>;
  }> = {};
  // Cooldown for zone-step dialogue triggers (zone object id -> last tick).
  // 5-minute cooldown prevents spam when a character loiters in the zone.
  private zoneStepCooldown: Record<string, number> = {};
  private zoneScanTick = 0; // throttle scans to once per ~30 ticks (~1s)
  private zoneStepActive = false; // true while a zone dialogue is playing

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

    // Wire up collision dialogue
    this.mgr.onCollision = (idA, idB) => this.handleCollision(idA, idB);

    this.canvas.addEventListener("click", this.onClick);
  }

  private dispatchZoneClick(type: InteractionZoneType) {
    switch (type) {
      case "bulletin":   this.opts.onBulletinClick?.(); return;
      case "dashboard":  this.opts.onBossScreenClick?.(); return;
      case "chatroom":   this.opts.onChatroomClick?.(); return;
    }
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

    // Interaction zones (Phase B P2-1: 2026-04-22)
    // Walk the typed spec table; if a layout object with matching `special`
    // exists, hit-test it. Otherwise fall back to the legacy bbox constants
    // (chatroom has no legacy bbox — layout object is required).
    for (const spec of INTERACTION_ZONE_SPECS) {
      const obj = this.layout?.objects.find((o) => o.special === spec.special);
      if (obj) {
        if (px >= obj.x && px <= obj.x + obj.width &&
            py >= obj.y && py <= obj.y + obj.height) {
          this.dispatchZoneClick(spec.type);
          return;
        }
        // When an explicit layout object is defined we do NOT consult the
        // legacy bbox — the layout wins.
        continue;
      }
      // Legacy bbox fallback for zones that existed before layout JSON.
      if (spec.type === "bulletin") {
        const bb = BULLETIN_BOARD;
        if (px >= bb.x * TILE && px <= (bb.x + bb.w) * TILE &&
            py >= bb.y * TILE && py <= (bb.y + bb.h) * TILE) {
          this.dispatchZoneClick("bulletin");
          return;
        }
      } else if (spec.type === "dashboard") {
        const bs = BOSS_SCREEN;
        if (px >= bs.x * TILE && px <= (bs.x + bs.w) * TILE &&
            py >= bs.y * TILE && py <= (bs.y + bs.h) * TILE) {
          this.dispatchZoneClick("dashboard");
          return;
        }
      }
      // chatroom has no legacy fallback by design
    }

    const hit = this.mgr.findCharacterAt(px, py);
    if (hit) {
      if (hit.def.isWaffles) {
        // Waffles excited v2 animation — use current facing direction
        this.wafflesExcitedDir = hit.facing;
        const wafflesAnims: WafflesAnim[] = ["bark", "idle", "running", "sneaking", "walk"];
        this.wafflesClickAnim = wafflesAnims[Math.floor(Math.random() * wafflesAnims.length)];
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
        this.opts.onWafflesZoom?.(this.wafflesClickAnim!, this.wafflesExcitedDir);

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

    // Load sprite atlases (per-character packed PNGs + JSON metadata)
    const plNames = Array.from(PIXELLAB_CHARACTERS);
    const atlasResults = await Promise.allSettled(
      plNames.map(async (charId) => {
        const [img, res] = await Promise.all([
          load(`/sprites/atlas/${charId}.png`),
          fetch(`/sprites/atlas/${charId}.json`),
        ]);
        if (!res.ok) throw new Error(`Failed to load atlas JSON for ${charId}`);
        const meta = await res.json() as { frames: Record<string, AtlasFrame> };
        this.atlasMap[charId] = { image: img, frames: meta.frames };
      })
    );

    // Log any atlas load failures (will fall through to fallback rendering)
    for (let i = 0; i < plNames.length; i++) {
      const r = atlasResults[i];
      if (r.status === "rejected") {
        console.warn(`[SpriteAtlas] Failed to load atlas for ${plNames[i]}:`, r.reason);
      }
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
      // Sync character desk positions from layout anchors
      updateCharacterPositions(this.layout);
      this.mgr.refreshHomePositions();
      const walkMap = computeWalkableMap(this.layout);
      setActiveWalkableMap(walkMap);
    } catch {
      // Fallback: no layout, renderStaticScene will use legacy path
      this.layout = null;
    }

    renderStaticScene(this.offCtx, this.tileImg, this.layout ?? undefined);

    // Trigger celebrate animation for all characters on load
    for (const c of this.mgr.characters) {
      this.mgr.triggerCelebrate(c.def.id);
    }
  }

  /** Reset all characters to home position (for editor mode) */
  resetCharactersToHome() {
    this.mgr.resetAllToHome();
  }

  /** Re-render static scene (called after layout edits) */
  rerender() {
    if (this.layout) {
      updateCharacterPositions(this.layout);
      this.mgr.refreshHomePositions();
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
    // Detect members newly entering "celebrating" (before mgr updates state)
    const newCelebrating: string[] = [];
    for (const c of this.mgr.characters) {
      const d = data[c.def.id];
      if (d?.status === "celebrating" && c.state !== "celebrating") {
        newCelebrating.push(c.def.id);
      }
    }

    this.memberStatuses = data;
    this.mgr.updateStatuses(data);

    // Show dialogue bubble for newly celebrating members (not init celebrate)
    const CELEBRATE_BUBBLE_DURATION = 210; // ~7 秒 @ 30fps, matches 3-loop celebrate animation
    for (const charId of newCelebrating) {
      const d = data[charId];
      if (!d?.task) continue; // no task description = no bubble
      const c = this.mgr.characters.find((ch) => ch.def.id === charId);
      if (!c) continue;
      this.dlg.show(charId, d.task, c.px, c.py, this.tick, CELEBRATE_BUBBLE_DURATION);
    }
  }

  /** Phase B P2-3 (2026-04-22): push chat summaries so zone-step dialogue
   *  can play from the correct channel without extra API calls. */
  updateChatSummaries(summaries: Array<{
    channel_id: string;
    participant_a: string;
    participant_b: string;
    messages: Array<{ sender: string; content: string; created_at: string }>;
  }>) {
    const map: typeof this.chatSummariesByChannel = {};
    for (const s of summaries) {
      map[s.channel_id] = {
        participant_a: s.participant_a,
        participant_b: s.participant_b,
        messages: s.messages || [],
      };
    }
    this.chatSummariesByChannel = map;
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

  /** Set meeting mode: all characters walk to meeting room (or return home) */
  setMeeting(active: boolean) {
    this.mgr.setMeeting(active);
  }

  // ── Collision dialogue handling ──────────────────────────────

  private async handleCollision(idA: string, idB: string) {
    this.mgr.setDialogueActive(true);

    const charA = this.mgr.characters.find((c) => c.def.id === idA);
    const charB = this.mgr.characters.find((c) => c.def.id === idB);
    if (!charA || !charB) {
      this.mgr.setDialogueActive(false);
      return;
    }

    // Stop both characters and face each other
    const prevStateA = charA.state;
    const prevStateB = charB.state;
    charA.state = "idle_away";
    charB.state = "idle_away";
    charA.path = [];
    charB.path = [];
    charA.pathIndex = 0;
    charB.pathIndex = 0;
    // Face each other
    if (charA.px < charB.px) {
      charA.facing = "east";
      charB.facing = "west";
    } else if (charA.px > charB.px) {
      charA.facing = "west";
      charB.facing = "east";
    } else if (charA.py < charB.py) {
      charA.facing = "south";
      charB.facing = "north";
    } else {
      charA.facing = "north";
      charB.facing = "south";
    }

    // Build character definitions (needed for thinking bubble + API request)
    const defA = CHARACTERS.find((c) => c.id === idA);
    const defB = CHARACTERS.find((c) => c.id === idB);

    // Show thinking indicator in bottom bar
    const nameA = defA?.nameCn || defA?.name || idA;
    const colorA = defA?.color || "#222";
    const roleA = defA?.role || "";
    const nameB = defB?.nameCn || defB?.name || idB;
    const colorB = defB?.color || "#222";
    const roleB = defB?.role || "";
    this.opts.onConversationBar?.({
      charAId: idA, charBId: idB,
      charAName: nameA, charBName: nameB,
      charARole: roleA, charBRole: roleB,
      charAColor: colorA, charBColor: colorB,
      speaker: "A", text: "...",
    });

    type DialogueLine = { speaker: "A" | "B"; text: string };
    let lines: DialogueLine[] | null = null;
    let dialogueId: string | null = null;

    // ── localStorage seen-dialogue tracking ──────────────────
    const SEEN_KEY = "dialogue-seen";
    const FORTY_EIGHT_H = 48 * 60 * 60 * 1000;
    const pairKey = [idA, idB].sort().join("|");

    let seenData: Record<string, { ids: string[]; lastSeen: number }> = {};
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw) seenData = JSON.parse(raw);
    } catch { /* ignore parse errors */ }

    // Clear stale pair data (> 48h)
    const pairEntry = seenData[pairKey];
    if (pairEntry && Date.now() - pairEntry.lastSeen > FORTY_EIGHT_H) {
      delete seenData[pairKey];
    }
    const excludeIds = seenData[pairKey]?.ids || [];

    try {
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charA: { id: idA },
          charB: { id: idB },
          excludeIds,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.dialogue) && data.dialogue.length >= 2) {
          lines = data.dialogue;
          dialogueId = data.id || null;
        }
      }
    } catch {
      // API failed — use fallback
    }

    // Save seen dialogue id to localStorage
    if (dialogueId) {
      if (!seenData[pairKey]) {
        seenData[pairKey] = { ids: [], lastSeen: Date.now() };
      }
      seenData[pairKey].ids.push(dialogueId);
      seenData[pairKey].lastSeen = Date.now();
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(seenData));
      } catch { /* storage full — ignore */ }
    }

    // No stored dialogue for this pair — skip conversation entirely
    if (!lines) {
      this.opts.onConversationBar?.(null);
      charA.walkTimer = rand(5 * 30, 15 * 30);
      charB.walkTimer = rand(5 * 30, 15 * 30);
      this.mgr.setDialogueActive(false);
      return;
    }

    // Display lines sequentially via bottom bar
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      this.opts.onConversationBar?.({
        charAId: idA, charBId: idB,
        charAName: nameA, charBName: nameB,
        charARole: roleA, charBRole: roleB,
        charAColor: colorA, charBColor: colorB,
        speaker: line.speaker,
        text: line.text,
      });
      await this.delay(5000);
    }
    this.opts.onConversationBar?.(null);

    // Resume characters
    charA.walkTimer = rand(5 * 30, 15 * 30);
    charB.walkTimer = rand(5 * 30, 15 * 30);
    // Keep idle_away so they'll naturally walk home
    this.mgr.setDialogueActive(false);
  }

  private guessLocation(px: number, py: number): string {
    const ty = Math.floor(py / TILE);
    const tx = Math.floor(px / TILE);
    if (ty >= 17 && tx < 6) return "茶水間";
    if (ty >= 17 && tx >= 6) return "會議室旁";
    if (ty <= 5) return "走廊";
    return "辦公區走道";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Phase B P2-3 (2026-04-22): zone-step dialogue ────────────
  // Scan trigger zones carrying a dialogueChannel. If any character's
  // current tile falls inside the zone and cooldown has elapsed, play
  // the latest exchange from that channel via the conversation bar.
  private ZONE_STEP_COOLDOWN_TICKS = 300 * 5; // ~5 min at 30 tps
  private checkZoneSteps() {
    if (this.zoneStepActive) return;
    if (!this.layout) return;
    const zones = this.layout.objects.filter(
      (o) => o.special && o.special.startsWith("trigger-") && o.dialogueChannel,
    );
    if (zones.length === 0) return;

    for (const zone of zones) {
      const last = this.zoneStepCooldown[zone.id] ?? -Infinity;
      if (this.tick - last < this.ZONE_STEP_COOLDOWN_TICKS) continue;

      const anyoneStandingInZone = this.mgr.characters.some((c) =>
        c.px >= zone.x && c.px <= zone.x + zone.width &&
        c.py >= zone.y && c.py <= zone.y + zone.height,
      );
      if (!anyoneStandingInZone) continue;

      const channelId = zone.dialogueChannel!;
      const summary = this.chatSummariesByChannel[channelId];
      if (!summary || summary.messages.length === 0) continue;

      this.zoneStepCooldown[zone.id] = this.tick;
      // Fire and forget — async play does not block the loop
      void this.playZoneDialogue(summary);
    }
  }

  private async playZoneDialogue(summary: {
    participant_a: string;
    participant_b: string;
    messages: Array<{ sender: string; content: string; created_at: string }>;
  }) {
    this.zoneStepActive = true;
    try {
      const idA = summary.participant_a;
      const idB = summary.participant_b;
      const defA = CHARACTERS.find((c) => c.id === idA);
      const defB = CHARACTERS.find((c) => c.id === idB);
      const nameA = defA?.nameCn || defA?.name || idA;
      const nameB = defB?.nameCn || defB?.name || idB;
      const colorA = defA?.color || "#222";
      const colorB = defB?.color || "#222";
      const roleA = defA?.role || "";
      const roleB = defB?.role || "";

      // Last 4 messages, speaker mapped to A/B based on sender id.
      const lines = summary.messages.slice(-4).map((m) => ({
        speaker: m.sender === idA ? ("A" as const) : ("B" as const),
        text: m.content,
      }));

      for (const line of lines) {
        this.opts.onConversationBar?.({
          charAId: idA, charBId: idB,
          charAName: nameA, charBName: nameB,
          charARole: roleA, charBRole: roleB,
          charAColor: colorA, charBColor: colorB,
          speaker: line.speaker,
          text: line.text,
        });
        await this.delay(5000);
      }
      this.opts.onConversationBar?.(null);
    } finally {
      this.zoneStepActive = false;
    }
  }

  private loop = (now: number) => {
    const dt = now - this.lastT;
    if (dt >= this.interval) {
      this.lastT = now - (dt % this.interval);
      if (!this.editorMode) {
        this.mgr.update(this.tick);
        this.dlg.update(this.tick);
        for (const c of this.mgr.characters) this.dlg.updatePosition(c.def.id, c.px, c.py);
        // Phase B P2-3: scan zone-step triggers once per ~1s
        if (++this.zoneScanTick >= 30) {
          this.zoneScanTick = 0;
          this.checkZoneSteps();
        }
      }
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
        const frame = Math.min(this.wafflesClickFrame, 3);
        const excitedKey = `v2-waffles-excited-${this.wafflesExcitedDir}-${frame}`;
        const atlasEntry = this.atlasMap["waffles"];
        const atlasFrame = atlasEntry?.frames[excitedKey];
        const animImg = atlasEntry?.image;
        if (animImg && atlasFrame) {
          const dw = 216, dh = 216;
          const footY = c.py + 51;
          // Draw shadow
          ctx.fillStyle = "rgba(0,0,0,0.15)";
          ctx.beginPath();
          ctx.ellipse(c.px, footY - 2, dw / 2 - 4, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          // Draw v2 excited animation frame from atlas
          ctx.drawImage(animImg, atlasFrame.x, atlasFrame.y, atlasFrame.w, atlasFrame.h, c.px - dw / 2, footY - dh, dw, dh);
          // Draw status icon (don't skip during animation)
          if (c.statusIcon) {
            const floatY = Math.sin((this.tick / 60) * Math.PI * 2) * 6;
            const emoteImg = getMapObj(c.statusIcon);
            if (emoteImg) {
              const maxSz = 120;
              const eAspect = emoteImg.naturalWidth / emoteImg.naturalHeight;
              const ew = eAspect >= 1 ? maxSz : maxSz * eAspect;
              const eh = eAspect >= 1 ? maxSz / eAspect : maxSz;
              ctx.drawImage(emoteImg, c.px - ew / 2, footY - dh - eh + 22 + floatY, ew, eh);
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
        this.atlasMap,
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
