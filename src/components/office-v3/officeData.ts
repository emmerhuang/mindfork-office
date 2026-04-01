// officeData.ts — Canvas 常數、角色定義、房間座標

export const TILE = 96;
export const CANVAS_W = 1152;  // 12 cols * 96
export const CANVAS_H = 1920;  // 20 rows * 96
export const COLS = 12;
export const ROWS = 20;
export const TARGET_FPS = 30;

// ── 角色 ──────────────────────────────────────────────────

export type CharacterId =
  | "boss" | "secretary" | "sherlock" | "lego"
  | "vault" | "forge" | "lens" | "waffles";

export interface CharacterDef {
  id: CharacterId;
  name: string;
  nameCn: string;
  role: string;
  color: string;
  dialogues: string[];
  deskTile: { x: number; y: number };
  isWaffles?: boolean;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "boss", name: "Boss", nameCn: "老大", role: "總指揮",
    color: "#8B0000",
    dialogues: [
      "方向對了，細節讓團隊搞定。",
      "這週的 OKR 更新了嗎？",
      "風險要早說，不要等我問。",
      "執行力是策略的一部分。",
      "先把這件事收掉，再談下一件。",
    ],
    deskTile: { x: 1, y: 4 },
  },
  {
    id: "secretary", name: "Secretary", nameCn: "秘書長", role: "協調與調度",
    color: "#1e3a5f",
    dialogues: [
      "task queue 清空了，大家辛苦了。",
      "Rate limit 快到了，先收尾重要工作。",
      "這件事排給誰比較合適？",
      "把決策記下來，不然三個月後沒人記得。",
      "先確認需求，再開始實作。",
    ],
    deskTile: { x: 9, y: 4 },
  },
  {
    id: "sherlock", name: "Sherlock", nameCn: "Sherlock", role: "需求分析師",
    color: "#C0392B",
    dialogues: [
      "等等，這個需求背後的需求是什麼？",
      "使用者說要 A，但他真正需要的是 B。",
      "再訪談一輪，上次漏問了邊界條件。",
      "文件寫得模糊，代表需求還沒想清楚。",
      "這個 user story 的 acceptance criteria 在哪裡？",
      "我問問題，不是因為不信任你，是因為我信任流程。",
    ],
    deskTile: { x: 1, y: 7 },
  },
  {
    id: "lego", name: "Lego", nameCn: "Lego", role: "架構設計師",
    color: "#E87D20",
    dialogues: [
      "這個設計三個月後還能擴展嗎？",
      "低耦合、高內聚。這不是口號，是生存法則。",
      "API 設計錯了，之後每一層都會還債。",
      "你說的『之後再重構』，我聽到的是『永遠不會』。",
      "模組邊界畫清楚，合作才不會變合謀。",
      "這個 trade-off 值得，但要記錄下來。",
    ],
    deskTile: { x: 5, y: 7 },
  },
  {
    id: "vault", name: "Vault", nameCn: "Vault", role: "資料庫設計師",
    color: "#2D5A3D",
    dialogues: [
      "Schema 改錯了，migration 是雙向道但現實只能單行。",
      "NULL 是個哲學問題，我不喜歡哲學問題出現在欄位定義裡。",
      "Index 加對了比什麼 cache 都有效。",
      "外鍵約束存在是有原因的，不要關掉它。",
      "這個查詢要跑多久？我需要 EXPLAIN ANALYZE。",
      "資料是公司最貴的資產，我只是它的管理員。",
    ],
    deskTile: { x: 9, y: 7 },
  },
  {
    id: "forge", name: "Forge", nameCn: "Forge", role: "技術實作工程師",
    color: "#6C3483",
    dialogues: [
      "Build 成功，但我還要再看一眼。",
      "這個 PR 我自己 review 三次了，還是要送 Lens 掃。",
      "技術債不是欠不欠的問題，是利率的問題。",
      "能跑的程式不等於好程式，但好程式一定要能跑。",
      "這個 edge case 我三點想到的，睡不著就補了測試。",
      "部署前我再跑一次 build，習慣了。",
    ],
    deskTile: { x: 1, y: 10 },
  },
  {
    id: "lens", name: "Lens", nameCn: "Lens", role: "測試工程師",
    color: "#2980B9",
    dialogues: [
      "這個邊界條件你有測嗎？我猜沒有。",
      "測試通過不代表正確，只代表你測的那些情況是正確的。",
      "覆蓋率 100% 是假象，重點是測了對的東西。",
      "Flaky test 是在告訴你：系統裡有你不了解的非確定性。",
      "測試是文件，好的測試告訴你這段程式應該做什麼。",
      "上線前五分鐘說『應該沒問題吧』是我最不想聯到的話。",
    ],
    deskTile: { x: 5, y: 10 },
  },
  {
    id: "waffles", name: "Waffles", nameCn: "Waffles", role: "柯基督察",
    color: "#F39C12",
    dialogues: [
      "汪。（翻譯：這個設計我支持）",
      "...汪汪！（我剛才睡著了，但精神很好）",
      "搖尾巴.jpg",
      "聽不懂技術討論，但感覺大家都很認真，讚。",
      "有人說茶水間嗎？",
      "（把頭擠進 Lego 的螢幕前）我也要看架構圖。",
    ],
    deskTile: { x: 9, y: 10 },
    isWaffles: true,
  },
];

// ── 房間 ──────────────────────────────────────────────────

export const ROOMS = {
  wall:        { x: 0, y: 0,  w: 12, h: 3 },
  work:        { x: 0, y: 3,  w: 12, h: 12 },
  tearoom:     { x: 0, y: 15, w: 6,  h: 5, dest: { x: 3, y: 17 } },
  meetingRoom: { x: 6, y: 15, w: 6,  h: 5, dest: { x: 9, y: 17 } },
} as const;

// ── Walkable tile map (true = walkable) ────────────────────
// 12 cols x 16 rows. Wall (rows 0-2) = blocked.
// Desks occupy 2-tile width at each character's deskTile position.
// Tearoom equipment occupies left side (cols 0-2, rows 13-14).
// Meeting table occupies center-right area (cols 8-10, row 14).

function buildWalkableMap(): boolean[][] {
  const map: boolean[][] = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r < 3) {
        // Wall area — blocked
        map[r][c] = false;
      } else if (r >= 3 && r < 15) {
        // Work area — default walkable
        map[r][c] = true;
      } else {
        // Tearoom + meeting room — default walkable
        map[r][c] = true;
      }
    }
  }

  // Block desk tiles (each desk is 2 tiles wide)
  for (const ch of CHARACTERS) {
    if (ch.isWaffles) {
      // Dog bed: 2 tiles wide
      map[ch.deskTile.y][ch.deskTile.x] = false;
      if (ch.deskTile.x + 1 < COLS) map[ch.deskTile.y][ch.deskTile.x + 1] = false;
    } else {
      // Desk: 2 tiles wide
      map[ch.deskTile.y][ch.deskTile.x] = false;
      if (ch.deskTile.x + 1 < COLS) map[ch.deskTile.y][ch.deskTile.x + 1] = false;
    }
  }

  // Block tearoom equipment — row 15 cols 0-2 (fridge, water cooler, coffee machine)
  map[15][0] = false; map[15][1] = false; map[15][2] = false;
  // Block tearoom snack shelf (row 15, col 5)
  map[15][5] = false;
  // Block tearoom table + chairs (rows 17-18, cols 1-3)
  map[17][1] = false; map[17][2] = false; map[17][3] = false;
  map[18][1] = false; map[18][2] = false;
  // Block microwave (row 15, col 3)
  map[15][3] = false;
  // Block tearoom trash can (row 19, col 0)
  map[19][0] = false;

  // Block meeting table area (rows 16-18, cols 8-10)
  map[16][8] = false; map[16][9] = false; map[16][10] = false;
  map[17][8] = false; map[17][9] = false; map[17][10] = false;
  map[18][8] = false; map[18][9] = false; map[18][10] = false;
  // Block meeting chairs (rows 16 & 18, cols 7 & 11)
  map[16][7] = false; map[16][11] = false;
  map[18][7] = false; map[18][11] = false;
  // Block projector screen (row 15, cols 8-10)
  map[15][8] = false; map[15][9] = false; map[15][10] = false;

  // Block plant tiles (col 5-6, row 4)
  map[4][5] = false;
  map[4][6] = false;

  // Bulletin board on wall: clickable area (row 2, cols 4-7) — not blocking but marked
  // (Wall is already blocked, this is just for click detection in engine)

  return map;
}

export const WALKABLE_MAP = buildWalkableMap();

// Bulletin board position on wall (for click detection)
export const BULLETIN_BOARD = { x: 4, y: 1, w: 4, h: 2 } as const;

// Boss desk screen position (for click detection)
// 覆蓋 row 3-4，讓桌上螢幕的視覺區域都能被點到
export const BOSS_SCREEN = { x: 1, y: 3, w: 2, h: 2 } as const;
