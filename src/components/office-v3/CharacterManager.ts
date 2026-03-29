// CharacterManager.ts — 角色狀態機
// 負責每個角色的位置、動畫、自言自語觸發

import { CHARACTERS, CharacterDef, TILE, ROOMS } from "./officeData";

// ────────────────────────────────────────────────────────────
// 型別定義
// ────────────────────────────────────────────────────────────

export type CharacterState = "working" | "walking" | "idle_away";

export interface CharacterInstance {
  def: CharacterDef;
  // 像素座標（角色中心）
  px: number;
  py: number;
  // 目標像素座標（walking 狀態）
  targetPx: number;
  targetPy: number;
  // 桌子位置（home）
  homePx: number;
  homePy: number;
  state: CharacterState;
  animFrame: number;         // 0 or 1，交替用
  animTimer: number;         // 計 ticks
  dialogueTimer: number;     // 距下次自言自語的 ticks
  walkTimer: number;         // 距下次走動的 ticks
  isGoingHome: boolean;      // 正在走回桌子
}

// 點擊事件回呼
export type ClickHandler = (charId: string) => void;

// ────────────────────────────────────────────────────────────
// 輔助常數
// ────────────────────────────────────────────────────────────

const WALK_SPEED = 1.5;       // px per tick
const ANIM_INTERVAL = 30;     // 每 30 ticks（1秒）切換一次，自然不閃
// 對話觸發間隔（ticks @ 30fps）
const DIALOGUE_MIN = 30 * 30; // 30 秒
const DIALOGUE_MAX = 90 * 30; // 90 秒
// 走動觸發間隔
const WALK_MIN = 20 * 30;     // 20 秒
const WALK_MAX = 60 * 30;     // 60 秒

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function tileCenter(tileX: number, tileY: number): { px: number; py: number } {
  return {
    px: tileX * TILE + TILE,   // 桌寬 2 tiles，取中心
    py: tileY * TILE + TILE,   // 角色站在桌子前方（+1 tile）
  };
}

// ────────────────────────────────────────────────────────────
// 走動目的地（茶水間 or 會議室中心）
// ────────────────────────────────────────────────────────────

function getRandomDestination(): { px: number; py: number } {
  const dest =
    Math.random() < 0.5
      ? ROOMS.tearoom.destination
      : ROOMS.meetingRoom.destination;
  return {
    px: dest.x * TILE + TILE / 2,
    py: dest.y * TILE + TILE / 2,
  };
}

// ────────────────────────────────────────────────────────────
// CharacterManager
// ────────────────────────────────────────────────────────────

export class CharacterManager {
  characters: CharacterInstance[];
  private onDialogue: (charId: string, text: string) => void;

  constructor(onDialogue: (charId: string, text: string) => void) {
    this.onDialogue = onDialogue;
    this.characters = CHARACTERS.map((def) => {
      const home = tileCenter(def.deskTile.x, def.deskTile.y);
      return {
        def,
        px: home.px,
        py: home.py,
        targetPx: home.px,
        targetPy: home.py,
        homePx: home.px,
        homePy: home.py,
        state: "working" as CharacterState,
        animFrame: 0,
        animTimer: 0,
        dialogueTimer: randInt(DIALOGUE_MIN, DIALOGUE_MAX),
        walkTimer: randInt(WALK_MIN, WALK_MAX),
        isGoingHome: false,
      };
    });
  }

  // 每幀更新
  update(tick: number) {
    for (const char of this.characters) {
      this.updateChar(char, tick);
    }
  }

  private updateChar(char: CharacterInstance, tick: number) {
    // 動畫幀切換
    char.animTimer++;
    if (char.animTimer >= ANIM_INTERVAL) {
      char.animFrame = char.animFrame === 0 ? 1 : 0;
      char.animTimer = 0;
    }

    // 自言自語 countdown
    char.dialogueTimer--;
    if (char.dialogueTimer <= 0) {
      this.triggerDialogue(char);
      char.dialogueTimer = randInt(DIALOGUE_MIN, DIALOGUE_MAX);
    }

    // 走動 countdown（只在 working 狀態）
    if (char.state === "working") {
      char.walkTimer--;
      if (char.walkTimer <= 0) {
        // 開始走去茶水間 or 會議室
        const dest = getRandomDestination();
        char.targetPx = dest.px;
        char.targetPy = dest.py;
        char.state = "walking";
        char.isGoingHome = false;
        char.walkTimer = randInt(WALK_MIN, WALK_MAX);
      }
    }

    // 走路邏輯
    if (char.state === "walking") {
      this.moveTowardTarget(char);
    }

    // idle_away：在目的地待 3-8 秒後走回去
    if (char.state === "idle_away") {
      char.walkTimer--;
      if (char.walkTimer <= 0) {
        char.targetPx = char.homePx;
        char.targetPy = char.homePy;
        char.state = "walking";
        char.isGoingHome = true;
        char.walkTimer = randInt(WALK_MIN, WALK_MAX);
      }
    }
  }

  private moveTowardTarget(char: CharacterInstance) {
    const dx = char.targetPx - char.px;
    const dy = char.targetPy - char.py;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= WALK_SPEED) {
      // 到達目標
      char.px = char.targetPx;
      char.py = char.targetPy;

      if (char.isGoingHome) {
        char.state = "working";
        char.isGoingHome = false;
      } else {
        // 抵達目的地，待一段時間
        char.state = "idle_away";
        char.walkTimer = randInt(3 * 30, 8 * 30); // 3-8 秒
      }
    } else {
      char.px += (dx / dist) * WALK_SPEED;
      char.py += (dy / dist) * WALK_SPEED;
    }
  }

  private triggerDialogue(char: CharacterInstance) {
    const pool = char.def.dialogues;
    if (!pool || pool.length === 0) return;
    const text = pool[Math.floor(Math.random() * pool.length)];
    this.onDialogue(char.def.id, text);
  }

  // 點擊偵測：回傳被點到的角色（最近且在 20px 內）
  findCharacterAt(px: number, py: number): CharacterInstance | null {
    let closest: CharacterInstance | null = null;
    let closestDist = Infinity;
    const HIT_RADIUS = 20;

    for (const char of this.characters) {
      const dx = char.px - px;
      const dy = char.py - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < HIT_RADIUS && dist < closestDist) {
        closest = char;
        closestDist = dist;
      }
    }

    return closest;
  }

  // 接收外部狀態更新（保留擴展點）
  updateStatuses(data: Record<string, { status: string; task: string }>) {
    // Phase 4 DataBridge 接入點，目前 no-op
    void data;
  }
}
