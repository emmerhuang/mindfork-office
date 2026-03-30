// CharacterManager.ts — 角色狀態機（working / idle_home / walking / idle_away）

import { CHARACTERS, CharacterDef, TILE, ROOMS, CANVAS_W, CANVAS_H } from "./officeData";

export type CharState = "working" | "idle_home" | "walking" | "idle_away";

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
}

const SPEED = 2;                    // px/tick
const ANIM_TICK = 10;               // 每 30 ticks 切 frame
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

function randomDest(charId?: string) {
  // Lego 和 Sherlock 有機會去白板
  if ((charId === "lego" || charId === "sherlock") && Math.random() < 0.4) {
    return {
      px: WHITEBOARD.x * TILE + (Math.random() - 0.5) * TILE * 2,
      py: WHITEBOARD.y * TILE,
    };
  }
  const r = Math.random() < 0.5 ? ROOMS.tearoom : ROOMS.meetingRoom;
  const jitterX = (Math.random() - 0.5) * TILE * 3;
  const jitterY = (Math.random() - 0.5) * TILE * 1.5;
  return {
    px: r.dest.x * TILE + TILE / 2 + jitterX,
    py: r.dest.y * TILE + TILE / 2 + jitterY,
  };
}

export class CharacterManager {
  characters: CharInstance[];
  private onDialogue: (id: string, text: string) => void;

  constructor(onDialogue: (id: string, text: string) => void) {
    this.onDialogue = onDialogue;
    this.characters = CHARACTERS.map((def) => {
      const h = homePos(def);
      // boss 和 secretary 預設 working，其他人 idle_home（會走動）
      const initState: CharState = (def.id === "boss" || def.id === "secretary") ? "working" : "idle_home";
      return {
        def, ...h, targetPx: h.px, targetPy: h.py,
        homePx: h.px, homePy: h.py,
        state: initState,
        facing: "south",
        animFrame: 0, animTimer: 0,
        dialogueTimer: rand(DLG_MIN, DLG_MAX),
        walkTimer: rand(WALK_MIN, WALK_MAX),
        goingHome: false,
      };
    });
  }

  update(tick: number) {
    for (const c of this.characters) this.step(c, tick);
  }

  private step(c: CharInstance, _tick: number) {
    // anim frame
    if (++c.animTimer >= ANIM_TICK) { c.animFrame ^= 1; c.animTimer = 0; }

    // dialogue countdown
    if (--c.dialogueTimer <= 0) {
      const text = this.getDialogue(c.def.id);
      if (text) this.onDialogue(c.def.id, text);
      c.dialogueTimer = rand(DLG_MIN, DLG_MAX);
    }

    // state machine
    switch (c.state) {
      case "working":
        break; // working 狀態不離開座位
      case "idle_home":
        if (--c.walkTimer <= 0) {
          const d = randomDest(c.def.id);
          c.targetPx = d.px; c.targetPy = d.py;
          c.state = "walking"; c.goingHome = false;
          c.walkTimer = rand(WALK_MIN, WALK_MAX);
        }
        break;
      case "walking":
        this.move(c);
        break;
      case "idle_away":
        if (--c.walkTimer <= 0) {
          c.targetPx = c.homePx; c.targetPy = c.homePy;
          c.state = "walking"; c.goingHome = true;
          c.walkTimer = rand(WALK_MIN, WALK_MAX);
        }
        break;
    }
  }

  private move(c: CharInstance) {
    const dx = c.targetPx - c.px;
    const dy = c.targetPy - c.py;

    // L 型路徑：先水平移動，再垂直移動
    if (Math.abs(dx) > SPEED) {
      // 水平移動階段
      let nx = c.px + Math.sign(dx) * SPEED;
      const ny = c.py;
      c.facing = dx > 0 ? "east" : "west";

      // 碰撞避免
      const adjusted = this.avoidCollision(c, nx, ny);
      c.px = adjusted.x;
      c.py = adjusted.y;
    } else if (Math.abs(dy) > SPEED) {
      // 垂直移動階段（snap x 到目標）
      const nx = c.targetPx;
      let ny = c.py + Math.sign(dy) * SPEED;
      c.facing = dy > 0 ? "south" : "north";

      // 碰撞避免
      const adjusted = this.avoidCollision(c, nx, ny);
      c.px = adjusted.x;
      c.py = adjusted.y;
    } else {
      // 到達目標
      c.px = c.targetPx;
      c.py = c.targetPy;
      if (c.goingHome) { c.state = "idle_home"; c.goingHome = false; }
      else { c.state = "idle_away"; c.walkTimer = rand(STAY_MIN, STAY_MAX); }
    }
  }

  private avoidCollision(c: CharInstance, nx: number, ny: number) {
    const MIN_DIST = 50;
    for (const other of this.characters) {
      if (other === c) continue;
      const odx = nx - other.px, ody = ny - other.py;
      const od = Math.sqrt(odx * odx + ody * ody);
      if (od < MIN_DIST && od > 0) {
        nx += (odx / od) * (MIN_DIST - od) * 0.5;
        ny += (ody / od) * (MIN_DIST - od) * 0.5;
      }
    }
    // 邊界限制
    nx = Math.max(30, Math.min(CANVAS_W - 30, nx));
    ny = Math.max(TILE * 3 + 20, Math.min(CANVAS_H - 20, ny));
    return { x: nx, y: ny };
  }

  findCharacterAt(px: number, py: number): CharInstance | null {
    let best: CharInstance | null = null, bestD = 80; // hit radius（配合 TILE=96）
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
    // 優先用動態 OS（最新一筆），否則用固定台詞池
    const osList = this.dynamicOs[charId];
    if (osList && osList.length > 0) {
      const item = osList[0];
      // 防護：即使上游誤傳 object 也不 crash
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
        c.px = c.homePx; c.py = c.homePy;
        c.targetPx = c.homePx; c.targetPy = c.homePy;
      } else if (d.status === "idle" && c.state === "working") {
        c.state = "idle_home";
      } else if (d.status === "meeting") {
        const dest = ROOMS.meetingRoom.dest;
        c.targetPx = dest.x * TILE + (Math.random() - 0.5) * TILE * 2;
        c.targetPy = dest.y * TILE + (Math.random() - 0.5) * TILE;
        c.state = "walking";
        c.goingHome = false;
      }
    }
  }
}
