// lib/wiki-paths.ts — Wiki path 白名單驗證（safety boundary）
//
// Phase: 1b (P1-3 by Forge — 新建)
// Phase: 1c (P1-A by Forge — Lens 1b 找到的字元集漏洞修補)
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §A.1
//
// 規則：
//   1. target_page 必須是 forward-slash relative path（不是絕對路徑、不是 ..）
//   2. 必須以白名單前綴開頭（wiki/ 既有目錄）
//   3. 必須以 .md 結尾（wiki 是 markdown 知識庫）
//   4. 不可含 backslash（防 Windows path injection）、不可含 NUL byte、不可含控制字元
//   5. 路徑深度 <= 5（防深層巢狀繞過）
//   6. ★ Phase 1c P1-A：字元 whitelist — 只允許 [a-zA-Z0-9_\-./]
//      原因：Lens 1b 發現 target_page='wiki/concepts/'\''; DROP TABLE wiki_action_requests; --.md'
//        通過所有檢查 — Drizzle prepared statement 擋住了 SQL injection 但這個字串
//        會被 worker 當路徑 cp、會被 telegram 推給老大、會被 webapp render。
//        SQL injection 不是唯一風險面：路徑進磁碟、進前端、進通知都要乾淨。
//        production Turso 已有汙染 row（war_id=3 owner=lens），這輪只擋 NEW 入庫，
//        舊污染由 Phase 1f worker 啟動時的 allowlist 處理（老大 #6420 答 A）。
//
// 為什麼這些檢查在 endpoint 層做、不全靠 SQL CHECK：
//   - SQL CHECK 只檢 length 1~512，不檢路徑語意
//   - worker 端會 cp 到 .backups/ 並動 wiki/ 檔案，path traversal 會直接洞穿磁碟
//   - 早擋早安全（Lens 機會點 P1-3 path traversal 測試會跑）

/**
 * 允許的 wiki 子目錄（v2 doc §A.1 「路徑白名單 wiki/{entities,concepts,...}/」）
 * 這份清單與 wiki/ 實際目錄結構對齊。
 * 後續若新增子目錄要回來改這裡。
 */
const WIKI_PATH_ALLOWED_PREFIXES = [
  "wiki/entities/",
  "wiki/concepts/",
  "wiki/decisions/",
  "wiki/runbooks/",
  "wiki/glossary/",
  "wiki/projects/",
  "wiki/people/",
  "wiki/process/",
] as const;

const MAX_PATH_LENGTH = 512; // 與 SQL CHECK 對齊
const MAX_PATH_DEPTH = 5;

export interface PathValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateWikiPath(target: unknown): PathValidationResult {
  if (typeof target !== "string") {
    return { valid: false, reason: "target_page_not_string" };
  }
  if (target.length === 0 || target.length > MAX_PATH_LENGTH) {
    return { valid: false, reason: "target_page_length_out_of_range" };
  }
  // 控制字元 / NUL byte（個別擋以給清楚的 debug reason）
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(target)) {
    return { valid: false, reason: "target_page_contains_control_chars" };
  }
  // ★ P1-A 字元 whitelist：只允許 [a-zA-Z0-9_\-./]
  //   - 禁所有引號（' " `）、分號、< > & | * ? : 等可能在 shell/HTML/SQL 起作用的字元
  //   - 禁空白字元（空白符會讓 webapp render / telegram message 出現意外斷行/拼接）
  //   - 禁 unicode（path 是技術字串，不需要中文/日文/emoji；wiki 內容才允許）
  //   注意：此檢查涵蓋了下面 backslash 檢查的功能（\ 不在 whitelist），但 backslash 個別
  //         留下，給更具體的錯誤訊息協助開發者 debug。
  if (!/^[a-zA-Z0-9_\-./]+$/.test(target)) {
    return { valid: false, reason: "target_page_contains_illegal_chars" };
  }
  // 禁絕對路徑（Unix /, Windows C:）
  // 注意：whitelist 已禁 :，所以 Windows drive 拼法 'C:' 已被 illegal_chars 擋掉，
  //       這裡只剩 '/...' 開頭需擋。保留以便 debug 訊息精確。
  if (target.startsWith("/") || /^[A-Za-z]:/.test(target)) {
    return { valid: false, reason: "target_page_is_absolute" };
  }
  // 禁 backslash（Windows path injection）— whitelist 已涵蓋，這條保留作 debug 訊息
  if (target.includes("\\")) {
    return { valid: false, reason: "target_page_contains_backslash" };
  }
  // 禁 .. path traversal（含開頭、含中間、含結尾）
  if (target === ".." || target.includes("../") || target.includes("/..")) {
    return { valid: false, reason: "target_page_contains_traversal" };
  }
  // 禁雙 slash（//） — 容易繞 prefix 檢查
  if (target.includes("//")) {
    return { valid: false, reason: "target_page_contains_double_slash" };
  }
  // 必須以 .md 結尾
  if (!target.endsWith(".md")) {
    return { valid: false, reason: "target_page_must_end_with_md" };
  }
  // 必須在白名單前綴下
  const inWhitelist = WIKI_PATH_ALLOWED_PREFIXES.some((p) =>
    target.startsWith(p),
  );
  if (!inWhitelist) {
    return { valid: false, reason: "target_page_not_in_whitelist" };
  }
  // ★ Phase 1g P3-NEW-1（Lens 1f 機會點）：basename 結構檢查
  //   問題：`wiki/entities/.md` 通過所有上面的 check（whitelist OK、.md 結尾 OK、
  //         字元 whitelist OK、depth OK），但 basename 只有副檔名沒名字 — Linux
  //         會被當 hidden file（dotfile），FS pollution。
  //   修法：basename（最後一段）必須是「至少一個 [A-Za-z0-9_\-] 字元 + 1 個 . +
  //         至少一個字母數字字元」的形式。這同時排除 `.md`、`a.`、`.foo.md`
  //         （hidden）、`foo..md`（雙 dot）等變體。
  //   雙端規則：scripts/wiki/agent_worker_paths.py 必須同步。
  const basename = target.slice(target.lastIndexOf("/") + 1);
  if (!/^[A-Za-z0-9_\-]+\.[A-Za-z0-9]+$/.test(basename)) {
    return { valid: false, reason: "target_page_basename_invalid" };
  }
  // 路徑深度（split / 計數）
  const depth = target.split("/").length;
  if (depth > MAX_PATH_DEPTH) {
    return { valid: false, reason: "target_page_too_deep" };
  }
  return { valid: true };
}

/** 給 caller 顯示用 */
export const WIKI_PATH_WHITELIST_DESCRIPTION = WIKI_PATH_ALLOWED_PREFIXES.join(
  ", ",
);
