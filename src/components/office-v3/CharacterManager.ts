// CharacterManager.ts — 角色狀態機（working / idle_home / walking / idle_away）

import { CHARACTERS, CharacterDef, TILE, ROOMS } from "./officeData";

export type CharState = "working" | "idle_home" | "walking" | "idle_away";

export interface CharInstance {
  def: CharacterDef;
  px: number; py: number;           // 目前像素位置（中心）
  targetPx: number; targetPy: number;
  homePx: number; homePy: number;
  state: CharState;
  animFrame: number;
  animTimer: number;
  dialogueTimer: number;
  walkTimer: number;
  goingHome: boolean;
}

const SPEED = 2;                    // px/tick
const ANIM_TICK = 30;               // 每 30 ticks 切 frame
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

function randomDest() {
  const r = Math.random() < 0.5 ? ROOMS.tearoom : ROOMS.meetingRoom;
  // 隨機偏移避免所有人走到同一點
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
      return {
        def, ...h, targetPx: h.px, targetPy: h.py,
        homePx: h.px, homePy: h.py,
        state: "working" as CharState,
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
      const pool = c.def.dialogues;
      if (pool.length) this.onDialogue(c.def.id, pool[rand(0, pool.length - 1)]);
      c.dialogueTimer = rand(DLG_MIN, DLG_MAX);
    }

    // state machine
    switch (c.state) {
      case "working":
      case "idle_home":
        if (--c.walkTimer <= 0) {
          const d = randomDest();
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
    const dx = c.targetPx - c.px, dy = c.targetPy - c.py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= SPEED) {
      c.px = c.targetPx; c.py = c.targetPy;
      if (c.goingHome) { c.state = "idle_home"; c.goingHome = false; }
      else { c.state = "idle_away"; c.walkTimer = rand(STAY_MIN, STAY_MAX); }
    } else {
      c.px += (dx / dist) * SPEED;
      c.py += (dy / dist) * SPEED;
    }
  }

  findCharacterAt(px: number, py: number): CharInstance | null {
    let best: CharInstance | null = null, bestD = 25; // hit radius
    for (const c of this.characters) {
      const d = Math.sqrt((c.px - px) ** 2 + (c.py - py) ** 2);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  updateStatuses(_data: Record<string, { status: string; task: string }>) {
    // future: map external status to state machine
  }
}
