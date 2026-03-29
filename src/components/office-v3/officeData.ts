// officeData.ts — 所有常數：角色、台詞、座標

export const TILE = 64; // px per tile (bigger = more room)
export const CANVAS_W = 768;  // 12 cols * 64
export const CANVAS_H = 1024; // 16 rows * 64
export const COLS = CANVAS_W / TILE; // 12
export const ROWS = CANVAS_H / TILE; // 16
export const TARGET_FPS = 30;

// ────────────────────────────────────────────────────────────
// 角色定義
// ────────────────────────────────────────────────────────────

export type CharacterId =
  | "boss"
  | "secretary"
  | "sherlock"
  | "lego"
  | "vault"
  | "forge"
  | "lens"
  | "waffles";

export interface CharacterDef {
  id: CharacterId;
  name: string;
  nameCn: string;
  role: string;
  color: string;        // 主色（身體）
  skinColor: string;    // 膚色
  personality: string;
  currentTask: string;
  recentTasks: string[];
  dialogues: string[];
  deskTile: { x: number; y: number }; // 桌子的 tile 座標（左上角）
  isWaffles?: boolean;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "boss",
    name: "Boss",
    nameCn: "老大",
    role: "總指揮",
    color: "#8B0000",
    skinColor: "#F0C8A0",
    personality: "運籌帷幄，方向感強，偶爾神出鬼沒。",
    currentTask: "策略規劃與資源調度",
    recentTasks: ["確認 GG 案進度", "審核 Q2 預算", "團隊 1:1 面談"],
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
    id: "secretary",
    name: "Secretary",
    nameCn: "秘書長",
    role: "協調與調度",
    color: "#1e3a5f",
    skinColor: "#F5CBA7",
    personality: "細心協調，多工並行，是團隊的神經中樞。",
    currentTask: "管理 task queue 與團隊調度",
    recentTasks: ["處理 rate limit 排程", "協調 Staff Meeting", "回覆 Telegram 訊息"],
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
    id: "sherlock",
    name: "Sherlock",
    nameCn: "Sherlock",
    role: "需求分析師",
    color: "#C0392B",
    skinColor: "#FDEBD0",
    personality: "精準犀利，問問題不留情面，但每個問題都有原因。",
    currentTask: "釐清多帳本切換需求",
    recentTasks: ["訪談扶輪社會計流程", "撰寫帳號對帳 user story", "需求優先級排序"],
    dialogues: [
      "等等，這個需求背後的需求是什麼？",
      "使用者說要 A，但他真正需要的是 B。",
      "再訪談一輪，上次漏問了邊界條件。",
      "文件寫得模糊，代表需求還沒想清楚。",
      "這個 user story 的 acceptance criteria 在哪裡？",
      "我問問題，不是因為不信任你，是因為我信任流程。",
      "需求凍結了，但現實從沒凍結過。",
    ],
    deskTile: { x: 1, y: 7 },
  },
  {
    id: "lego",
    name: "Lego",
    nameCn: "Lego",
    role: "架構設計師",
    color: "#E87D20",
    skinColor: "#FDEBD0",
    personality: "思考長遠，設計精確，對技術債有強烈的感知能力。",
    currentTask: "設計 MindFork Office v3 架構",
    recentTasks: ["Canvas 2D 技術選型評估", "辦公室佈局座標設計", "模組介面定義"],
    dialogues: [
      "這個設計三個月後還能擴展嗎？",
      "低耦合、高內聚。這不是口號，是生存法則。",
      "API 設計錯了，之後每一層都會還債。",
      "你說的『之後再重構』，我聽到的是『永遠不會』。",
      "模組邊界畫清楚，合作才不會變合謀。",
      "安全不是 feature，是地基。地基不先打，樓蓋得再漂亮也是危樓。",
      "這個 trade-off 值得，但要記錄下來。",
      "Monolith 不丟臉，亂成一團的 Monolith 才丟臉。",
    ],
    deskTile: { x: 5, y: 7 },
  },
  {
    id: "vault",
    name: "Vault",
    nameCn: "Vault",
    role: "資料庫設計師",
    color: "#2D5A3D",
    skinColor: "#FDEBD0",
    personality: "嚴謹保守，對 NULL 有恐懼症，最愛說的話是「先 EXPLAIN 再說」。",
    currentTask: "設計 member_bank_accounts schema",
    recentTasks: ["建立 migration script", "設計 settlements 表結構", "Index 效能分析"],
    dialogues: [
      "Schema 改錯了，migration 是雙向道但現實只能單行。",
      "NULL 是個哲學問題，我不喜歡哲學問題出現在欄位定義裡。",
      "Index 加對了比什麼 cache 都有效。",
      "外鍵約束存在是有原因的，不要關掉它。",
      "這個查詢要跑多久？我需要 EXPLAIN ANALYZE。",
      "資料是公司最貴的資產，我只是它的管理員。",
      "正規化到第三正規型，然後有意識地反正規化。",
    ],
    deskTile: { x: 9, y: 7 },
  },
  {
    id: "forge",
    name: "Forge",
    nameCn: "Forge",
    role: "技術實作工程師",
    color: "#6C3483",
    skinColor: "#FDEBD0",
    personality: "細心踏實，先讀懂再動手，每次 build 前都要再確認一次。",
    currentTask: "實作 MindFork Office v3 Canvas 渲染",
    recentTasks: ["帳號對帳 UI + API", "e2e 測試補充", "rotarysso 通知 email 修復"],
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
    id: "lens",
    name: "Lens",
    nameCn: "Lens",
    role: "測試工程師",
    color: "#2980B9",
    skinColor: "#FDEBD0",
    personality: "銳利挑剔，邊界條件的獵人，對「應該沒問題吧」過敏。",
    currentTask: "審查 Canvas 渲染品質關卡",
    recentTasks: ["Playwright e2e 測試", "帳號對帳 UI 審查", "API 回傳格式驗證"],
    dialogues: [
      "這個邊界條件你有測嗎？我猜沒有。",
      "測試通過不代表正確，只代表你測的那些情況是正確的。",
      "覆蓋率 100% 是假象，重點是測了對的東西。",
      "這個 bug 在 code review 就該抓到，但我不說，我留到 QA 階段讓你印象深刻。",
      "Flaky test 是在告訴你：系統裡有你不了解的非確定性。",
      "測試是文件，好的測試告訴你這段程式應該做什麼。",
      "上線前五分鐘說『應該沒問題吧』是我最不想聽到的話。",
    ],
    deskTile: { x: 5, y: 10 },
  },
  {
    id: "waffles",
    name: "Waffles",
    nameCn: "Waffles",
    role: "柯基督察",
    color: "#F39C12",
    skinColor: "#F39C12",
    personality: "精力充沛，無條件信任每一個人，開會必搗亂，但氣氛擔當。",
    currentTask: "巡邏辦公室，確保士氣正常",
    recentTasks: ["陪 Lego 看架構圖", "在茶水間偷喝牛奶", "提醒大家休息"],
    dialogues: [
      "汪。（翻譯：這個設計我支持）",
      "...汪汪！（我剛才睡著了，但精神很好）",
      "搖尾巴.jpg",
      "聽不懂技術討論，但感覺大家都很認真，讚。",
      "有人說茶水間嗎？",
      "（把頭擠進 Lego 的螢幕前）我也要看架構圖。",
    ],
    deskTile: { x: 9, y: 10 }, // 狗窩位置（右下角，Lens 旁邊）
    isWaffles: true,
  },
];

// ────────────────────────────────────────────────────────────
// 房間座標（tile 單位）
// ────────────────────────────────────────────────────────────

export const ROOMS = {
  // 茶水間：左下，y=13-15, x=0-5
  tearoom: {
    bounds: { x: 0, y: 13, w: 6, h: 3 },
    destination: { x: 3, y: 14 },
  },
  // 會議室：右下，y=13-15, x=6-11
  meetingRoom: {
    bounds: { x: 6, y: 13, w: 6, h: 3 },
    destination: { x: 9, y: 14 },
  },
  // 主工作區
  workArea: {
    bounds: { x: 0, y: 3, w: 12, h: 10 },
  },
  // 牆壁區
  wallArea: {
    bounds: { x: 0, y: 0, w: 12, h: 3 },
  },
};

// ────────────────────────────────────────────────────────────
// 顏色常數
// ────────────────────────────────────────────────────────────

export const COLORS = {
  // 地板
  floorMain: "#D4C9B8",     // 主工作區地板（淡藍灰）
  floorTearoom: "#E8D5A3",  // 茶水間（暖黃）
  floorMeeting: "#D4C8E0",  // 會議室（淡紫）

  // 牆壁
  wallBase: "#2D5A27",      // 深綠色主牆
  wallTop: "#3A7233",       // 牆頂邊條
  wallWindow: "#87CEEB",    // 窗玻璃
  wallWindowFrame: "#8B6914", // 窗框

  // 家具
  deskTop: "#C4A87A",       // 桌面（木色）
  deskSide: "#A0825A",      // 桌側
  chairBase: "#8B7355",     // 椅子
  chairSeat: "#A09080",     // 椅面
  computerScreen: "#1a1a2e",// 電腦螢幕
  computerBase: "#555555",  // 螢幕底座
  keyboardColor: "#CCCCCC", // 鍵盤

  // 分隔線
  roomDivider: "#999080",

  // 植物
  plantPot: "#C0714A",
  plantLeaf: "#2E8B57",

  // 茶水間物件
  fridgeColor: "#D0D8E0",
  waterCooler: "#AACCDD",
  coffeeMaker: "#5A3A2A",

  // 會議室物件
  confTable: "#B8946A",
  confChair: "#8B6A50",

  // 書架
  bookshelf: "#7B5C3A",
  bookColors: ["#C0392B", "#2980B9", "#27AE60", "#E67E22", "#8E44AD", "#2C3E50"],

  // 狗窩
  dogBed: "#F39C12",
  dogBedDark: "#D68910",

  // 走廊/過道 - 略深色
  corridor: "#C8BCA8",
} as const;
