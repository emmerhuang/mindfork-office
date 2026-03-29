import * as Phaser from "phaser";
import { members } from "@/data/members";

// ============================================================
// Sprite sheet config (Premade_Character_48x48_XX.png)
// 48x96 frames, 56 columns per row
// Row 0: preview thumbnails
// Row 1: idle — right(6), up(6), left(6), down(6)
// Row 2: walk — right(6), up(6), left(6), down(6)
// ============================================================
const FRAME_W = 48;
const FRAME_H = 96;
const SHEET_COLS = 56;
const FRAMES_PER_DIR = 6;

// Member -> sprite sheet mapping
const SPRITE_MAP: Record<string, { key: string; file: string }> = {
  boss:      { key: "char01", file: "/sprites/Premade_Character_48x48_01.png" },
  secretary: { key: "char02", file: "/sprites/Premade_Character_48x48_02.png" },
  sherlock:  { key: "char03", file: "/sprites/Premade_Character_48x48_03.png" },
  lego:      { key: "char04", file: "/sprites/Premade_Character_48x48_04.png" },
  vault:     { key: "char05", file: "/sprites/Premade_Character_48x48_05.png" },
  forge:     { key: "char06", file: "/sprites/Premade_Character_48x48_06.png" },
  lens:      { key: "char09", file: "/sprites/Premade_Character_48x48_09.png" },
};

// Emote sheet config
const EMOTE_KEY = "emotes";
const EMOTE_SIZE = 48;

// ============================================================
// Office layout constants (world coordinates)
// ============================================================
const WORLD_W = 640;
const WORLD_H = 480;

const WALL_H = 130; // wall zone height

// Desk positions (world coords, center)
const DESK_POSITIONS: Record<string, { x: number; y: number }> = {
  boss:      { x: 110, y: 200 },
  secretary: { x: 310, y: 200 },
  sherlock:  { x: 90,  y: 290 },
  lego:      { x: 240, y: 290 },
  vault:     { x: 390, y: 290 },
  forge:     { x: 160, y: 380 },
  lens:      { x: 330, y: 380 },
};

// Character home positions (slightly above desk)
const HOME_POSITIONS: Record<string, { x: number; y: number }> = {
  boss:      { x: 110, y: 185 },
  secretary: { x: 310, y: 185 },
  sherlock:  { x: 90,  y: 275 },
  lego:      { x: 240, y: 275 },
  vault:     { x: 390, y: 275 },
  forge:     { x: 160, y: 365 },
  lens:      { x: 330, y: 365 },
  waffles:   { x: 200, y: 210 },
};

// Room centers
const TEAROOM = { x: 540, y: 430 };
const MEETING = { x: 100, y: 430 };
const DOG_BED = { x: 200, y: 210 };

type Direction = "down" | "left" | "right" | "up";

// ============================================================
// Helper: direction row offset for animations
// ============================================================
function dirOffset(dir: Direction): number {
  switch (dir) {
    case "right": return 0;
    case "up":    return 1;
    case "left":  return 2;
    case "down":  return 3;
  }
}

function directionFromDelta(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  }
  return dy > 0 ? "down" : "up";
}

// ============================================================
// Character entity
// ============================================================
interface CharState {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  emoteSprite: Phaser.GameObjects.Sprite | null;
  status: string;
  facing: Direction;
  moveTarget: { x: number; y: number } | null;
  idleTimer: Phaser.Time.TimerEvent | null;
  phase: "home" | "walking" | "visiting";
}

// ============================================================
// OfficeScene
// ============================================================
export class OfficeScene extends Phaser.Scene {
  private chars: CharState[] = [];
  private waffles: CharState | null = null;
  private statusData: Record<string, { status: string; task: string }> = {};

  constructor() {
    super({ key: "OfficeScene" });
  }

  // ---- PRELOAD ----
  preload() {
    // Character sprite sheets
    for (const [, cfg] of Object.entries(SPRITE_MAP)) {
      this.load.image(cfg.key, cfg.file);
    }
    // Emotes
    this.load.spritesheet(EMOTE_KEY, "/sprites/emotes_48x48.png", {
      frameWidth: EMOTE_SIZE,
      frameHeight: EMOTE_SIZE,
    });
  }

  // ---- CREATE ----
  create() {
    this.drawOffice();
    this.buildSpriteFrames();
    this.buildAnimations();
    this.spawnCharacters();
    this.spawnWaffles();

    // Click handler for member card (emit event to React)
    this.input.on("gameobjectdown", (_pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const charId = obj.getData("memberId") as string | undefined;
      if (charId) {
        this.game.events.emit("member-click", charId);
      }
    });
  }

  // ---- UPDATE ----
  update() {
    const moveSpeed = 80; // pixels/sec
    const dt = this.game.loop.delta / 1000;

    for (const ch of this.chars) {
      this.updateCharMovement(ch, moveSpeed, dt);
    }
    if (this.waffles) {
      this.updateCharMovement(this.waffles, 60, dt);
    }
  }

  // ---- Status update from React ----
  public updateStatuses(data: Record<string, { status: string; task: string }>) {
    this.statusData = data;
    for (const ch of this.chars) {
      const d = data[ch.id];
      if (d && d.status !== ch.status) {
        ch.status = d.status;
        this.onStatusChange(ch);
      }
    }
  }

  // ============================================================
  // Drawing the office with Graphics
  // ============================================================
  private drawOffice() {
    const g = this.add.graphics();

    // Wall (green)
    g.fillStyle(0x5b7a6a);
    g.fillRect(0, 0, WORLD_W, WALL_H);
    // Baseboard
    g.fillStyle(0x3d5548);
    g.fillRect(0, WALL_H - 4, WORLD_W, 4);

    // Floor (wood planks)
    g.fillStyle(0xc4a87a);
    g.fillRect(0, WALL_H, WORLD_W, WORLD_H - WALL_H);
    // Plank lines
    g.lineStyle(1, 0xb89868, 0.3);
    for (let y = WALL_H; y < WORLD_H; y += 20) {
      g.moveTo(0, y);
      g.lineTo(WORLD_W, y);
    }
    g.strokePath();

    // Windows on wall
    this.drawWindow(g, 40, 25, 60, 45);
    this.drawWindow(g, 540, 25, 60, 45);

    // Meeting room (bottom-left)
    g.fillStyle(0xd8ceb5, 0.6);
    g.fillRect(0, WORLD_H - 100, 220, 100);
    g.lineStyle(2, 0x8b7355);
    g.strokeRect(0, WORLD_H - 100, 220, 100);
    // Meeting table
    g.fillStyle(0x8b7355);
    g.fillRoundedRect(50, WORLD_H - 70, 120, 30, 4);
    // Chairs
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0x6b5335);
      g.fillRect(60 + i * 40, WORLD_H - 30, 12, 12);
    }

    // Tea room (bottom-right)
    g.fillStyle(0xddd4bf, 0.6);
    g.fillRect(WORLD_W - 220, WORLD_H - 100, 220, 100);
    g.lineStyle(2, 0x8b7355);
    g.strokeRect(WORLD_W - 220, WORLD_H - 100, 220, 100);
    // Coffee machine
    g.fillStyle(0x555555);
    g.fillRect(WORLD_W - 90, WORLD_H - 85, 20, 30);
    g.fillStyle(0xcc3333);
    g.fillCircle(WORLD_W - 80, WORLD_H - 77, 3); // power light
    // Water cooler
    g.fillStyle(0x88bbdd);
    g.fillRoundedRect(WORLD_W - 60, WORLD_H - 90, 16, 35, 3);

    // Room labels
    const labelStyle = { fontSize: "9px", fontFamily: "Courier New", color: "#8b735580" };
    this.add.text(8, WORLD_H - 96, "MEETING", labelStyle);
    this.add.text(WORLD_W - 212, WORLD_H - 96, "TEA ROOM", labelStyle);
    this.add.text(8, WALL_H + 4, "OFFICE", labelStyle);

    // Desks
    for (const [, pos] of Object.entries(DESK_POSITIONS)) {
      this.drawDesk(g, pos.x, pos.y);
    }

    // Dog bed near boss area
    g.fillStyle(0x8b6914);
    g.fillEllipse(DOG_BED.x, DOG_BED.y + 15, 40, 16);
    g.fillStyle(0xdbc07a);
    g.fillEllipse(DOG_BED.x, DOG_BED.y + 15, 34, 12);

    // Wall decorations: clock
    g.fillStyle(0xf5f0e0);
    g.fillCircle(WORLD_W / 2, 30, 12);
    g.lineStyle(2, 0x8b7355);
    g.strokeCircle(WORLD_W / 2, 30, 12);
    g.lineStyle(1, 0x333333);
    g.moveTo(WORLD_W / 2, 30);
    g.lineTo(WORLD_W / 2, 22);
    g.moveTo(WORLD_W / 2, 30);
    g.lineTo(WORLD_W / 2 + 6, 33);
    g.strokePath();

    // Title on wall
    this.add.text(WORLD_W / 2, 8, "MINDFORK HQ", {
      fontSize: "10px",
      fontFamily: "Courier New",
      color: "#ffffffcc",
    }).setOrigin(0.5, 0);

    // Status board placeholder area (React HUD will overlay)
    g.fillStyle(0xf5f0e0, 0.9);
    g.fillRoundedRect(380, 60, 180, 50, 4);
    g.lineStyle(1, 0xb89868);
    g.strokeRoundedRect(380, 60, 180, 50, 4);
    this.add.text(390, 65, "STATUS BOARD", {
      fontSize: "8px",
      fontFamily: "Courier New",
      color: "#b8986880",
    });

    // Bookshelf on wall (left side)
    g.fillStyle(0x6b4c30);
    g.fillRect(200, 60, 50, 50);
    g.lineStyle(1, 0x5a3c20);
    g.strokeRect(200, 60, 50, 50);
    // Books
    const bookColors = [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0xd4a843, 0x1abc9c];
    for (let i = 0; i < 6; i++) {
      g.fillStyle(bookColors[i]);
      g.fillRect(204 + i * 7, 65, 5, 18);
    }
    g.lineStyle(1, 0x5a3c20);
    g.moveTo(200, 85);
    g.lineTo(250, 85);
    g.strokePath();
    for (let i = 0; i < 4; i++) {
      g.fillStyle(bookColors[i + 2]);
      g.fillRect(204 + i * 8, 88, 6, 16);
    }
  }

  private drawWindow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    g.fillStyle(0x87ceeb, 0.4);
    g.fillRect(x, y, w, h);
    g.lineStyle(2, 0x8b7355);
    g.strokeRect(x, y, w, h);
    g.lineStyle(1, 0x8b7355);
    g.moveTo(x + w / 2, y);
    g.lineTo(x + w / 2, y + h);
    g.moveTo(x, y + h / 2);
    g.lineTo(x + w, y + h / 2);
    g.strokePath();
  }

  private drawDesk(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
    const dw = 50;
    const dh = 24;
    // Desk top
    g.fillStyle(0xc4a882);
    g.fillRoundedRect(cx - dw / 2, cy, dw, dh, 3);
    g.lineStyle(1, 0xa08060);
    g.strokeRoundedRect(cx - dw / 2, cy, dw, dh, 3);
    // Monitor
    g.fillStyle(0x333333);
    g.fillRect(cx - 8, cy - 6, 16, 12);
    g.fillStyle(0x4488cc);
    g.fillRect(cx - 6, cy - 4, 12, 8);
    // Monitor stand
    g.fillStyle(0x555555);
    g.fillRect(cx - 2, cy + 6, 4, 3);
  }

  // ============================================================
  // Sprite frame building
  // ============================================================
  private buildSpriteFrames() {
    for (const [, cfg] of Object.entries(SPRITE_MAP)) {
      const tex = this.textures.get(cfg.key);
      if (!tex.source.length) continue;
      const rows = Math.floor(tex.source[0].height / FRAME_H);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < SHEET_COLS; col++) {
          tex.add(
            row * SHEET_COLS + col,
            0,
            col * FRAME_W,
            row * FRAME_H,
            FRAME_W,
            FRAME_H,
          );
        }
      }
    }
  }

  private buildAnimations() {
    const directions: Direction[] = ["right", "up", "left", "down"];

    for (const [memberId, cfg] of Object.entries(SPRITE_MAP)) {
      for (let di = 0; di < 4; di++) {
        const dir = directions[di];
        // Idle animation (row 1)
        const idleStart = 1 * SHEET_COLS + di * FRAMES_PER_DIR;
        this.anims.create({
          key: `${memberId}-idle-${dir}`,
          frames: this.anims.generateFrameNumbers(cfg.key, {
            start: idleStart,
            end: idleStart + FRAMES_PER_DIR - 1,
          }),
          frameRate: 6,
          repeat: -1,
        });
        // Walk animation (row 2)
        const walkStart = 2 * SHEET_COLS + di * FRAMES_PER_DIR;
        this.anims.create({
          key: `${memberId}-walk-${dir}`,
          frames: this.anims.generateFrameNumbers(cfg.key, {
            start: walkStart,
            end: walkStart + FRAMES_PER_DIR - 1,
          }),
          frameRate: 8,
          repeat: -1,
        });
      }
    }
  }

  // ============================================================
  // Spawn characters
  // ============================================================
  private spawnCharacters() {
    const humanMembers = members.filter(m => m.id !== "waffles" && SPRITE_MAP[m.id]);

    for (const m of humanMembers) {
      const home = HOME_POSITIONS[m.id];
      const cfg = SPRITE_MAP[m.id];

      const sprite = this.add.sprite(home.x, home.y, cfg.key);
      sprite.setScale(0.75);
      sprite.setOrigin(0.5, 1);
      sprite.setInteractive({ cursor: "pointer" });
      sprite.setData("memberId", m.id);
      sprite.setDepth(Math.round(home.y));

      // Play idle-down by default
      sprite.play(`${m.id}-idle-down`);

      const nameText = this.add.text(home.x, home.y + 2, m.nameCn, {
        fontSize: "9px",
        fontFamily: "Courier New",
        color: m.primaryColor,
        stroke: "#00000066",
        strokeThickness: 1,
      }).setOrigin(0.5, 0).setDepth(999);

      const ch: CharState = {
        id: m.id,
        sprite,
        nameText,
        emoteSprite: null,
        status: m.status,
        facing: "down",
        moveTarget: null,
        idleTimer: null,
        phase: "home",
      };

      this.chars.push(ch);
      this.startIdleBehavior(ch);
    }
  }

  private spawnWaffles() {
    // Waffles uses an orange ellipse (no sprite sheet for dogs)
    const home = HOME_POSITIONS.waffles;

    // Create a small texture for Waffles
    const gfx = this.add.graphics();
    gfx.fillStyle(0xd4952a);
    gfx.fillEllipse(16, 12, 28, 18);
    // Ears
    gfx.fillStyle(0xb87d1e);
    gfx.fillTriangle(5, 6, 9, 0, 13, 6);
    gfx.fillTriangle(19, 6, 23, 0, 27, 6);
    // Eyes
    gfx.fillStyle(0x000000);
    gfx.fillCircle(11, 10, 2);
    gfx.fillCircle(21, 10, 2);
    // Nose
    gfx.fillStyle(0x333333);
    gfx.fillCircle(16, 14, 2);
    // White chest
    gfx.fillStyle(0xffffff);
    gfx.fillEllipse(16, 18, 12, 8);

    gfx.generateTexture("waffles-tex", 32, 24);
    gfx.destroy();

    const sprite = this.add.sprite(home.x, home.y, "waffles-tex");
    sprite.setOrigin(0.5, 1);
    sprite.setInteractive({ cursor: "pointer" });
    sprite.setData("memberId", "waffles");
    sprite.setDepth(Math.round(home.y));

    const nameText = this.add.text(home.x, home.y + 2, "Waffles", {
      fontSize: "8px",
      fontFamily: "Courier New",
      color: "#9a6b1a",
      stroke: "#00000066",
      strokeThickness: 1,
    }).setOrigin(0.5, 0).setDepth(999);

    this.waffles = {
      id: "waffles",
      sprite,
      nameText,
      emoteSprite: null,
      status: "idle",
      facing: "down",
      moveTarget: null,
      idleTimer: null,
      phase: "home",
    };

    this.startWafflesBehavior();
  }

  // ============================================================
  // Character movement
  // ============================================================
  private updateCharMovement(ch: CharState, speed: number, dt: number) {
    if (!ch.moveTarget) return;

    const dx = ch.moveTarget.x - ch.sprite.x;
    const dy = ch.moveTarget.y - ch.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 3) {
      // Arrived
      ch.sprite.x = ch.moveTarget.x;
      ch.sprite.y = ch.moveTarget.y;
      ch.moveTarget = null;

      // Switch to idle animation
      if (SPRITE_MAP[ch.id]) {
        ch.sprite.play(`${ch.id}-idle-${ch.facing}`, true);
      }

      ch.sprite.setDepth(Math.round(ch.sprite.y));
      this.updateNamePos(ch);
      return;
    }

    const step = speed * dt;
    const ratio = Math.min(step / dist, 1);
    ch.sprite.x += dx * ratio;
    ch.sprite.y += dy * ratio;
    ch.sprite.setDepth(Math.round(ch.sprite.y));
    this.updateNamePos(ch);

    // Update facing & animation
    const newDir = directionFromDelta(dx, dy);
    if (newDir !== ch.facing) {
      ch.facing = newDir;
      if (SPRITE_MAP[ch.id]) {
        ch.sprite.play(`${ch.id}-walk-${newDir}`, true);
      }
    }
  }

  private updateNamePos(ch: CharState) {
    ch.nameText.setPosition(ch.sprite.x, ch.sprite.y + 2);
    ch.nameText.setDepth(999);
  }

  private moveTo(ch: CharState, x: number, y: number) {
    ch.moveTarget = { x, y };
    const dx = x - ch.sprite.x;
    const dy = y - ch.sprite.y;
    ch.facing = directionFromDelta(dx, dy);
    if (SPRITE_MAP[ch.id]) {
      ch.sprite.play(`${ch.id}-walk-${ch.facing}`, true);
    }
  }

  // ============================================================
  // Emotes (bubbles above head)
  // ============================================================
  private showEmote(ch: CharState, frameIndex: number, duration: number = 2000) {
    if (ch.emoteSprite) {
      ch.emoteSprite.destroy();
    }
    ch.emoteSprite = this.add.sprite(ch.sprite.x, ch.sprite.y - 60, EMOTE_KEY, frameIndex);
    ch.emoteSprite.setScale(0.5);
    ch.emoteSprite.setDepth(1000);

    this.time.delayedCall(duration, () => {
      if (ch.emoteSprite) {
        ch.emoteSprite.destroy();
        ch.emoteSprite = null;
      }
    });
  }

  // ============================================================
  // Idle behavior
  // ============================================================
  private startIdleBehavior(ch: CharState) {
    if (ch.status === "working") {
      // Stay at desk, typing emote occasionally
      ch.phase = "home";
      this.scheduleTypingEmote(ch);
      return;
    }
    if (ch.status === "sleeping") {
      ch.phase = "home";
      return;
    }
    if (ch.status === "meeting") {
      this.moveToMeeting(ch);
      return;
    }

    // idle: after random delay, wander
    const delay = 3000 + Math.random() * 8000;
    ch.idleTimer = this.time.delayedCall(delay, () => {
      this.idleWander(ch);
    });
  }

  private idleWander(ch: CharState) {
    if (ch.phase === "home") {
      // Pick random destination
      const dests = [TEAROOM, MEETING];
      const dest = dests[Math.floor(Math.random() * dests.length)];
      const jitter = { x: dest.x + (Math.random() - 0.5) * 30, y: dest.y + (Math.random() - 0.5) * 20 };

      ch.phase = "walking";
      this.moveTo(ch, jitter.x, jitter.y);

      // Wait for arrival, then stay
      const dist = Math.sqrt(
        Math.pow(jitter.x - ch.sprite.x, 2) + Math.pow(jitter.y - ch.sprite.y, 2)
      );
      const travelTime = (dist / 80) * 1000 + 500;

      ch.idleTimer = this.time.delayedCall(travelTime, () => {
        ch.phase = "visiting";
        // Show drink emote if tearoom
        if (Math.abs(ch.sprite.x - TEAROOM.x) < 80) {
          this.showEmote(ch, 7, 3000); // coffee emote frame
        }

        // Stay for a while, then go home
        const stayMs = 4000 + Math.random() * 4000;
        ch.idleTimer = this.time.delayedCall(stayMs, () => {
          this.goHome(ch);
        });
      });
    } else {
      this.goHome(ch);
    }
  }

  private goHome(ch: CharState) {
    const home = HOME_POSITIONS[ch.id];
    ch.phase = "walking";
    this.moveTo(ch, home.x, home.y);

    const dist = Math.sqrt(
      Math.pow(home.x - ch.sprite.x, 2) + Math.pow(home.y - ch.sprite.y, 2)
    );
    const travelTime = (dist / 80) * 1000 + 500;

    ch.idleTimer = this.time.delayedCall(travelTime, () => {
      ch.phase = "home";
      const stayMs = 6000 + Math.random() * 8000;
      ch.idleTimer = this.time.delayedCall(stayMs, () => {
        if (ch.status === "idle") {
          this.idleWander(ch);
        }
      });
    });
  }

  private moveToMeeting(ch: CharState) {
    const offsets: Record<string, { dx: number; dy: number }> = {
      boss:      { dx: 0,  dy: -25 },
      secretary: { dx: 40, dy: -25 },
      sherlock:  { dx: -40, dy: 0 },
      lego:      { dx: 40,  dy: 0 },
      vault:     { dx: -40, dy: -25 },
      forge:     { dx: 0,   dy: 0 },
      lens:      { dx: -20, dy: -12 },
    };
    const off = offsets[ch.id] ?? { dx: 0, dy: 0 };
    this.moveTo(ch, MEETING.x + off.dx, MEETING.y + off.dy);
    ch.phase = "visiting";
  }

  private scheduleTypingEmote(ch: CharState) {
    const delay = 5000 + Math.random() * 10000;
    ch.idleTimer = this.time.delayedCall(delay, () => {
      if (ch.status === "working") {
        this.showEmote(ch, 0, 2000); // typing/thinking emote
        this.scheduleTypingEmote(ch);
      }
    });
  }

  // ============================================================
  // Waffles behavior
  // ============================================================
  private startWafflesBehavior() {
    if (!this.waffles) return;
    this.wafflesIdleCycle();
  }

  private wafflesIdleCycle() {
    if (!this.waffles) return;
    const w = this.waffles;

    // Rest on bed
    w.phase = "home";
    const restTime = 8000 + Math.random() * 6000;

    w.idleTimer = this.time.delayedCall(restTime, () => {
      if (!this.waffles) return;
      // Pick a random team member to visit
      const targets = ["boss", "sherlock", "forge", "lens", "secretary"];
      const pick = targets[Math.floor(Math.random() * targets.length)];
      const targetPos = HOME_POSITIONS[pick];
      if (!targetPos) {
        this.wafflesIdleCycle();
        return;
      }

      // Walk to team member
      w.phase = "walking";
      this.moveTo(w, targetPos.x + 15, targetPos.y);

      const dist = Math.sqrt(
        Math.pow(targetPos.x + 15 - w.sprite.x, 2) + Math.pow(targetPos.y - w.sprite.y, 2)
      );
      const travelTime = (dist / 60) * 1000 + 500;

      w.idleTimer = this.time.delayedCall(travelTime, () => {
        w.phase = "visiting";
        // Stay and wag
        this.showEmote(w, 3, 2000); // heart emote

        const stayMs = 3000 + Math.random() * 3000;
        w.idleTimer = this.time.delayedCall(stayMs, () => {
          // Go back to bed
          this.moveTo(w, DOG_BED.x, DOG_BED.y);
          const homeDist = Math.sqrt(
            Math.pow(DOG_BED.x - w.sprite.x, 2) + Math.pow(DOG_BED.y - w.sprite.y, 2)
          );
          w.idleTimer = this.time.delayedCall((homeDist / 60) * 1000 + 500, () => {
            w.phase = "home";
            this.wafflesIdleCycle();
          });
        });
      });
    });
  }

  // ============================================================
  // Status change handler
  // ============================================================
  private onStatusChange(ch: CharState) {
    // Cancel current timer
    if (ch.idleTimer) {
      ch.idleTimer.destroy();
      ch.idleTimer = null;
    }
    ch.moveTarget = null;
    this.startIdleBehavior(ch);
  }
}
