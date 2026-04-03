// CharacterManager.ts — 角色狀態機（working / idle_home / walking / idle_away / celebrating）
// 含 A* tile-level pathfinding + Waffles 多動畫支援

import { CHARACTERS, CharacterDef, TILE, ROOMS, CANVAS_W, CANVAS_H, COLS, ROWS, activeWalkableMap } from "./officeData";
import { CELEBRATE_FRAME_COUNTS, WafflesAnim } from "./spriteAtlas";

export type CharState = "working" | "idle_home" | "walking" | "idle_away" | "celebrating";

export interface CharInstance {
  def: CharacterDef;
  px: number; py: number;           // 目前像素位置（中心）
  targetPx: number; targetPy: number;
  homePx: number; homePy: number;
  state: CharState;
  facing: string;                   // "south" | "north" | "east" | "west"
  animFrame: number;
  animTimer: number;
  dialogueTimer: number;
  walkTimer: number;
  goingHome: boolean;
  // A* path (tile coords)
  path: Array<{ x: number; y: number }>;
  pathIndex: number;
  // Celebrate state
  celebrateFrame: number;
  celebrateTimer: number;
  celebrateTotal: number;
  celebrateLoops: number;    // how many loops remaining
  celebratePause: number;    // pause ticks between loops (30 = 1 sec @30fps)
  // Waffles special animation
  wafflesAnim: WafflesAnim;
  // Status icon
  statusIcon: string; // emoji to show above head
}

const SPEED = 2;                    // px/tick
const ANIM_TICK = 10;               // 每 10 ticks 切 frame（idle）
const ANIM_TICK_WALK = 6;           // 走路時更快切 frame
const ANIM_TICK_CELEBRATE = 5;      // 慶祝動畫更快
const DLG_MIN = 30 * 30;            // 30s
const DLG_MAX = 90 * 30;            // 90s
const WALK_MIN = 20 * 30;           // 20s
const WALK_MAX = 60 * 30;           // 60s
const STAY_MIN = 5 * 30;            // 5s
const STAY_MAX = 10 * 30;           // 10s

const rand = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

function homePos(d: CharacterDef) {
  return { px: d.deskTile.x * TILE + TILE, py: d.deskTile.y * TILE + TILE };
}

// 白板位置（牆面上方，時鐘旁）
const WHITEBOARD = { x: 5, y: 3.5 };

function randomDest(charId?: string): { px: number; py: number } | null {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let px: number, py: number;

    // Lego 和 Sherlock 有機會去白板
    if ((charId === "lego" || charId === "sherlock") && Math.random() < 0.4) {
      px = WHITEBOARD.x * TILE + (Math.random() - 0.5) * TILE * 2;
      py = WHITEBOARD.y * TILE;
    } else {
      const r = Math.random() < 0.5 ? ROOMS.tearoom : ROOMS.meetingRoom;
      const jitterX = (Math.random() - 0.5) * TILE * 3;
      const jitterY = (Math.random() - 0.5) * TILE * 1.5;
      px = r.dest.x * TILE + TILE / 2 + jitterX;
      py = r.dest.y * TILE + TILE / 2 + jitterY;
    }

    // 檢查目的地 tile 是否 walkable
    const tileX = Math.floor(px / TILE);
    const tileY = Math.floor(py / TILE);
    if (isWalkable(tileX, tileY)) {
      return { px, py };
    }
  }

  // 3 次都落在不可走的 tile，放棄
  return null;
}

// ── A* Pathfinding ──────────────────────────────────────────

interface TileNode {
  x: number; y: number;
  g: number; h: number; f: number;
  parent: TileNode | null;
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function findPath(
  startPx: number, startPy: number,
  endPx: number, endPy: number,
  dynamicBlocked?: Set<string>,
): Array<{ x: number; y: number }> {
  const sx = Math.floor(startPx / TILE);
  const sy = Math.floor(startPy / TILE);
  const ex = Math.floor(endPx / TILE);
  const ey = Math.floor(endPy / TILE);

  // If start or end is same tile, just go direct
  if (sx === ex && sy === ey) return [];

  // Clamp to bounds
  const clampX = (v: number) => Math.max(0, Math.min(COLS - 1, v));
  const clampY = (v: number) => Math.max(0, Math.min(ROWS - 1, v));

  const startX = clampX(sx), startY = clampY(sy);
  const endX = clampX(ex), endY = clampY(ey);

  // If destination is not walkable, find nearest walkable tile
  let targetX = endX, targetY = endY;
  if (!isWalkable(targetX, targetY)) {
    let bestDist = Infinity;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = clampX(targetX + dx);
        const ny = clampY(targetY + dy);
        if (isWalkable(nx, ny)) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d < bestDist) { bestDist = d; targetX = nx; targetY = ny; }
        }
      }
    }
  }

  const open: TileNode[] = [];
  const closed = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;

  const start: TileNode = {
    x: startX, y: startY,
    g: 0, h: heuristic(startX, startY, targetX, targetY),
    f: heuristic(startX, startY, targetX, targetY),
    parent: null,
  };
  open.push(start);

  const DIRS = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  ];

  let iterations = 0;
  while (open.length > 0 && iterations < 500) {
    iterations++;
    // Find lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open.splice(bestIdx, 1);

    if (current.x === targetX && current.y === targetY) {
      // Reconstruct path
      const path: Array<{ x: number; y: number }> = [];
      let node: TileNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    closed.add(key(current.x, current.y));

    for (const dir of DIRS) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (!isWalkable(nx, ny)) continue;
      // Dynamic obstacles: other characters' tiles (but allow target tile)
      if (dynamicBlocked && dynamicBlocked.has(key(nx, ny)) &&
          !(nx === targetX && ny === targetY)) continue;
      if (closed.has(key(nx, ny))) continue;

      const g = current.g + 1;
      const h = heuristic(nx, ny, targetX, targetY);
      const existing = open.find((n) => n.x === nx && n.y === ny);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + h;
          existing.parent = current;
        }
      } else {
        open.push({ x: nx, y: ny, g, h, f: g + h, parent: current });
      }
    }
  }

  // No path found — fallback to direct movement
  return [];
}

function isWalkable(tx: number, ty: number): boolean {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false;
  return activeWalkableMap[ty]?.[tx] ?? false;
}

// ── Waffles walk animation selection ────────────────────────

function pickWafflesWalkAnim(): WafflesAnim {
  const r = Math.random();
  if (r < 0.5) return "walk";
  if (r < 0.75) return "running";
  return "sneaking";
}

// ── CharacterManager ────────────────────────────────────────

export class CharacterManager {
  characters: CharInstance[];
  private onDialogue: (id: string, text: string) => void;
  private currentTick = 0;

  constructor(onDialogue: (id: string, text: string) => void) {
    this.onDialogue = onDialogue;
    this.characters = CHARACTERS.map((def) => {
      const h = homePos(def);
      // boss 和 secretary 預設 working，其他人 idle_home
      const initState: CharState = (def.id === "boss" || def.id === "secretary") ? "working" : "idle_home";
      return {
        def, ...h, targetPx: h.px, targetPy: h.py,
        homePx: h.px, homePy: h.py,
        state: initState,
        facing: "north",
        animFrame: 0, animTimer: 0,
        dialogueTimer: rand(DLG_MIN, DLG_MAX),
        walkTimer: rand(60, 450), // 初始 2-15 秒就開始動（而非 20-60 秒）
        goingHome: false,
        path: [],
        pathIndex: 0,
        celebrateFrame: 0,
        celebrateTimer: 0,
        celebrateTotal: 0,
        celebrateLoops: 0,
        celebratePause: 0,
        wafflesAnim: "walk" as WafflesAnim,
        statusIcon: "",
      };
    });
  }

  /** Reset all characters to their home (desk) position, idle_home facing north */
  resetAllToHome() {
    for (const c of this.characters) {
      const h = homePos(c.def);
      c.px = h.px;
      c.py = h.py;
      c.targetPx = h.px;
      c.targetPy = h.py;
      c.homePx = h.px;
      c.homePy = h.py;
      c.state = "idle_home";
      c.facing = "north";
      c.path = [];
      c.pathIndex = 0;
      c.goingHome = false;
      c.walkTimer = rand(WALK_MIN, WALK_MAX);
    }
  }

  /** Recalculate home positions from CHARACTERS deskTile (call after updateCharacterPositions) */
  refreshHomePositions() {
    for (const c of this.characters) {
      const h = homePos(c.def);
      c.homePx = h.px;
      c.homePy = h.py;
      // If character is at desk (working or idle_home), also move current position
      if (c.state === "working" || c.state === "idle_home") {
        c.px = h.px;
        c.py = h.py;
        c.targetPx = h.px;
        c.targetPy = h.py;
      }
    }
  }

  update(tick: number) {
    this.currentTick = tick;
    for (const c of this.characters) this.step(c, tick);
  }

  private step(c: CharInstance, _tick: number) {
    // Update status icon
    this.updateStatusIcon(c, _tick);

    // Celebrate state has its own anim timer
    if (c.state === "celebrating") {
      // Pause between loops
      if (c.celebratePause > 0) {
        c.celebratePause--;
        return;
      }
      if (++c.celebrateTimer >= ANIM_TICK_CELEBRATE) {
        c.celebrateFrame++;
        c.celebrateTimer = 0;
        if (c.celebrateFrame >= c.celebrateTotal) {
          c.celebrateLoops--;
          if (c.celebrateLoops > 0) {
            // Reset for next loop with 1 sec pause
            c.celebrateFrame = 0;
            c.celebratePause = 30; // 30 ticks = 1 sec @30fps
          } else {
            // All loops done, return to idle_home
            c.state = "idle_home";
            c.facing = "north";
            c.celebrateFrame = 0;
          }
        }
      }
      return;
    }

    // Anim frame tick
    const animSpeed = c.state === "walking" ? ANIM_TICK_WALK : ANIM_TICK;
    if (++c.animTimer >= animSpeed) { c.animFrame = (c.animFrame + 1) % 4; c.animTimer = 0; }

    // dialogue countdown
    if (--c.dialogueTimer <= 0) {
      const text = this.getDialogue(c.def.id);
      if (text) this.onDialogue(c.def.id, text);
      c.dialogueTimer = rand(DLG_MIN, DLG_MAX);
    }

    // state machine
    switch (c.state) {
      case "working":
        // Boss / Secretary 偶爾站起來走一圈
        if (c.def.id === "boss" || c.def.id === "secretary") {
          if (--c.walkTimer <= 0) {
            // 30% 機率站起來走走
            if (Math.random() < 0.3) {
              const d = randomDest(c.def.id);
              if (d) this.startWalkTo(c, d.px, d.py, false);
              // 走到目的地 -> idle_away -> 回家 -> idle_home -> updateStatuses 恢復 working
            }
            c.walkTimer = rand(60 * 30, 120 * 30); // 60-120 秒 @ 30fps
          }
        }
        break;
      case "idle_home":
        if (--c.walkTimer <= 0) {
          const d = randomDest(c.def.id);
          if (d) this.startWalkTo(c, d.px, d.py, false);
          c.walkTimer = rand(WALK_MIN, WALK_MAX);
        }
        break;
      case "walking":
        this.moveAlongPath(c);
        break;
      case "idle_away":
        if (--c.walkTimer <= 0) {
          this.startWalkTo(c, c.homePx, c.homePy, true);
          c.walkTimer = rand(WALK_MIN, WALK_MAX);
        }
        break;
    }
  }

  private startWalkTo(c: CharInstance, destPx: number, destPy: number, goingHome: boolean) {
    c.targetPx = destPx;
    c.targetPy = destPy;
    c.goingHome = goingHome;
    c.state = "walking";
    c.path = findPath(c.px, c.py, destPx, destPy, this.buildDynamicBlocked(c));
    c.pathIndex = 0;
    // Waffles picks a random walk animation
    if (c.def.isWaffles) {
      c.wafflesAnim = pickWafflesWalkAnim();
    }
  }

  /** Build a set of tile keys occupied by other walking characters */
  private buildDynamicBlocked(exclude: CharInstance): Set<string> {
    const blocked = new Set<string>();
    for (const other of this.characters) {
      if (other === exclude) continue;
      if (other.state !== "walking") continue;
      const tx = Math.floor(other.px / TILE);
      const ty = Math.floor(other.py / TILE);
      blocked.add(`${tx},${ty}`);
    }
    return blocked;
  }

  private moveAlongPath(c: CharInstance) {
    if (c.path.length > 0 && c.pathIndex < c.path.length) {
      // Move toward next tile center
      const nextTile = c.path[c.pathIndex];
      const goalPx = nextTile.x * TILE + TILE / 2;
      const goalPy = nextTile.y * TILE + TILE / 2;
      const dx = goalPx - c.px;
      const dy = goalPy - c.py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= SPEED) {
        c.px = goalPx;
        c.py = goalPy;
        c.pathIndex++;
        if (c.pathIndex >= c.path.length) {
          this.arriveAtDest(c);
        }
      } else {
        c.px += (dx / dist) * SPEED;
        c.py += (dy / dist) * SPEED;
        // Update facing
        if (Math.abs(dx) > Math.abs(dy)) {
          c.facing = dx > 0 ? "east" : "west";
        } else {
          c.facing = dy > 0 ? "south" : "north";
        }
      }
    } else {
      // No path found — stay in place instead of moving through obstacles
      this.arriveAtDest(c);
      return; // skip collision/clamp since we didn't move
    }

    // Collision avoidance with other characters
    for (const other of this.characters) {
      if (other === c) continue;
      const odx = c.px - other.px;
      const ody = c.py - other.py;
      const od = Math.sqrt(odx * odx + ody * ody);
      const MIN_DIST = 50;
      if (od < MIN_DIST && od > 0) {
        const prevPx = c.px;
        const prevPy = c.py;
        if (c.state === "walking" && other.state === "walking") {
          // Both walking: randomly turn left or right to avoid
          const perpX = -ody / od;
          const perpY = odx / od;
          const push = MIN_DIST * 0.5;
          const dir = Math.random() < 0.5 ? 1 : -1;
          c.px += perpX * push * dir;
          c.py += perpY * push * dir;
        } else {
          // One is stationary: simple push avoidance
          c.px += (odx / od) * (MIN_DIST - od) * 0.3;
          c.py += (ody / od) * (MIN_DIST - od) * 0.3;
        }
        // Validate pushed position is walkable; revert if not
        const newTx = Math.floor(c.px / TILE);
        const newTy = Math.floor(c.py / TILE);
        if (!isWalkable(newTx, newTy)) {
          c.px = prevPx;
          c.py = prevPy;
        } else if (c.state === "walking" && other.state === "walking") {
          // Recalculate path from new (valid) position
          c.path = findPath(c.px, c.py, c.targetPx, c.targetPy, this.buildDynamicBlocked(c));
          c.pathIndex = 0;
        }
      }
    }

    // Boundary clamp (also enforce walkable)
    c.px = Math.max(30, Math.min(CANVAS_W - 30, c.px));
    c.py = Math.max(TILE * 3 + 20, Math.min(CANVAS_H - 20, c.py));
  }

  private arriveAtDest(c: CharInstance) {
    if (c.goingHome) {
      c.state = "idle_home";
      c.facing = "north";
      c.goingHome = false;
    } else {
      c.state = "idle_away";
      c.walkTimer = rand(STAY_MIN, STAY_MAX);
    }
    c.path = [];
    c.pathIndex = 0;
    // 立即更新 statusIcon，避免到達那一 tick 渲染空白
    this.updateStatusIcon(c, this.currentTick);
  }

  /** Trigger celebrate animation for a character */
  triggerCelebrate(charId: string, loops = 3) {
    const c = this.characters.find((ch) => ch.def.id === charId);
    if (!c) return;
    c.state = "celebrating";
    c.facing = "south";
    c.celebrateFrame = 0;
    c.celebrateTimer = 0;
    c.celebrateTotal = CELEBRATE_FRAME_COUNTS[charId] ?? 6;
    c.celebrateLoops = loops;
    c.celebratePause = 0;
    // Move back home first
    c.px = c.homePx;
    c.py = c.homePy;
  }

  // idle icon assignment — 固定在進入 idle 時隨機選一次，站定期間不切換
  private idleIcons: Record<string, string> = {};

  private updateStatusIcon(c: CharInstance, _tick: number) {
    // emote-0: WORKING (wrench/gear)    emote-1: THINKING (lightbulb)
    // emote-2: LOVE (heart)             emote-3: SLEEPING (ZZZ)
    // emote-4: COFFEE (cup)             emote-5: HAPPY (music note)
    // emote-6: ALERT (exclamation)      emote-7: CELEBRATING (stars)
    // emote-8: CONFUSED (question mark)
    switch (c.state) {
      case "working":
        c.statusIcon = "emote-7";
        break;
      case "celebrating":
        c.statusIcon = "emote-7"; // CELEBRATING (stars)
        break;
      case "walking":
        c.statusIcon = ""; // 走路有動畫，不需額外圖示
        // 清除 idle icon 快取，下次 idle 重新選
        delete this.idleIcons[c.def.id];
        break;
      case "idle_home": {
        // 隨機從 coffee / love / happy 選一個（進入 idle 時選一次，站定期間不切換）
        if (!this.idleIcons[c.def.id]) {
          const choices = ["emote-4", "emote-2", "emote-5"]; // coffee, love, happy
          this.idleIcons[c.def.id] = choices[Math.floor(Math.random() * choices.length)];
        }
        c.statusIcon = this.idleIcons[c.def.id];
        break;
      }
      case "idle_away": {
        // 隨機從 thinking / confused / sleeping 選一個（進入 idle 時選一次）
        if (!this.idleIcons[c.def.id]) {
          const choices = ["emote-1", "emote-8", "emote-3"]; // thinking, confused, sleeping
          this.idleIcons[c.def.id] = choices[Math.floor(Math.random() * choices.length)];
        }
        c.statusIcon = this.idleIcons[c.def.id];
        break;
      }
      default:
        c.statusIcon = "";
    }
  }

  findCharacterAt(px: number, py: number): CharInstance | null {
    let best: CharInstance | null = null, bestD = 80;
    for (const c of this.characters) {
      const d = Math.sqrt((c.px - px) ** 2 + (c.py - py) ** 2);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  private dynamicOs: Record<string, string[]> = {};

  updateOs(osData: Record<string, string[]>) {
    this.dynamicOs = osData;
  }

  getDialogue(charId: string): string {
    const osList = this.dynamicOs[charId];
    if (osList && osList.length > 0) {
      const item = osList[0];
      return typeof item === "string" ? item : String(item);
    }
    const def = CHARACTERS.find(c => c.id === charId);
    if (def && def.dialogues.length) return def.dialogues[rand(0, def.dialogues.length - 1)];
    return "";
  }

  updateStatuses(data: Record<string, { status: string; task: string }>) {
    for (const c of this.characters) {
      const d = data[c.def.id];
      if (!d) continue;
      if (d.status === "working" && c.state !== "working") {
        c.state = "working";
        c.facing = "north";
        c.px = c.homePx; c.py = c.homePy;
        c.targetPx = c.homePx; c.targetPy = c.homePy;
      } else if (d.status === "idle" && c.state === "working") {
        c.state = "idle_home";
      } else if (d.status === "celebrating") {
        this.triggerCelebrate(c.def.id);
      } else if (d.status === "meeting") {
        const dest = ROOMS.meetingRoom.dest;
        const destPx = dest.x * TILE + (Math.random() - 0.5) * TILE * 2;
        const destPy = dest.y * TILE + (Math.random() - 0.5) * TILE;
        this.startWalkTo(c, destPx, destPy, false);
      }
    }
  }
}
