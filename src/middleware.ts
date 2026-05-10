// middleware.ts — Edge runtime middleware
//
// Phase: 1g (P1-14 by Forge — 新建)
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §C.5
//              + Lens 1e P2-NEW-2 / P3-NEW-2 機會點
//
// 三個職責：
//   1. /wiki* 帶 ?t=<token> 的請求 → rewrite 到 /api/wiki/auth-magic（Node runtime
//      做 token DB lookup + use_count++ + set cookie + redirect 去掉 ?t=）。
//      middleware 自己不碰 crypto + DB（Edge runtime 限制）。
//   2. log filter：?t=<token> 一旦進入 /wiki* 立即被 rewrite，後續 page render 看
//      不到 token。Vercel access log 仍會記第一個 request 的 query string，但
//      auth-magic endpoint redirect 後的 page render 行 log 已不含 token。
//      → 第一行 log 仍是攻擊面（24h TTL + revoke 緩解，v2 §C.5 已分析）。
//   3. Referrer-Policy: no-referrer override（Phase 1.1 P1-S1）
//      ── 整站 catchall 預設 strict-origin-when-cross-origin（next.config.ts）；
//      但 /wiki* 是 token URL 入口，必須再嚴格一層：
//      - rewrite hop 之後 page render 仍可能含 outbound 連結（圖片、外部連結）
//      - strict-origin-when-cross-origin 在跨域時還會帶 origin（沒帶 path/query）
//      - no-referrer 連 origin 都不帶，杜絕「老大訪問 wiki 後點外鏈→外站知道
//        他來自 mindfork-office.vercel.app/wiki」的指紋
//      Next.js headers latest-wins：middleware 設 header 在 response 階段，會
//        蓋過 next.config.ts 的 catchall（per /wiki* matcher）。token route
//        (/api/wiki/token/*) 仍維持 next.config.ts 的 strict-origin（token route
//        不在本 middleware matcher 內）。
//
// 為什麼用 redirect 而非 rewrite（Phase 1.1 P2 UX 修正）：
//   - 1g 原本用 rewrite：rewrite 是 server-side 改 URL，瀏覽器看到的 URL 仍是
//     /wiki?t=...，但實際 handler 是 /api/wiki/auth-magic。
//   - 但 1g rewrite 在 /wiki/:path* matcher 下，內部 url.searchParams.set("next", ...)
//     沒有被尊重 — auth-magic 收到的 next 變成空 / "/wiki"，導致 valid token 點
//     /wiki/123?t= 最後 redirect 到 /wiki list（Lens 1g AC P2-NEW 觀察到、Lens 1.1
//     deep probe 4 case 全 FAIL）。
//   - 改用 redirect：browser 重新發 request 打 /api/wiki/auth-magic?t=&next=<原 path>，
//     URL 走 wire 不走 internal state，next 一定正確傳遞。代價：多一個 302 hop
//     （middleware 302 → /api/wiki/auth-magic → 302 → 原 path），但最終瀏覽器
//     URL 仍乾淨無 ?t=，cookie 仍由 auth-magic 設（middleware Edge runtime 不能
//     做 sig+DB 驗證所以無法直接設）。
//
// 關於 #anchor 保留：HTTP 規格 fragment 不送到 server，server 端看不到 #anchor，
//   所以 middleware 沒辦法在 redirect 時帶 anchor。瀏覽器在 follow redirect 時
//   會自動把原始 URL 的 #anchor 套到最終 location（除非 location 自己有
//   anchor），所以 #anchor 會自然保留。
//
// 不在這裡做：
//   - token 驗 sig（要 Node crypto，Edge runtime 雖有 Web Crypto subtle 但 wiki-hmac
//     用 Node crypto 同步 API，重寫風險高，不值）
//   - DB lookup（Edge runtime 不能用 libSQL HTTP client 同步呼叫）
//   - Set cookie + redirect 邏輯（auth-magic endpoint 集中處理）
//
// matcher 為什麼是 /wiki/:path*：
//   - /wiki 自己 + 子路徑 (/wiki/[id])
//   - 不含 /api/wiki/*（API endpoint 不應從 ?t= URL 進入；老大點的 magic link 一定
//     是頁面 URL，不是 API）
//   - 不含 /api/wiki/auth-magic（避免遞迴，但 matcher 不含 /api/* 已自然排除）

import { NextRequest, NextResponse } from "next/server";

// Phase 1.1 P1-S1: 強制 /wiki* 走 no-referrer，無論帶不帶 token
// 為什麼不只在 token rewrite 路徑加：page render 階段也可能有 outbound 連結
//   （wiki 內 markdown 可能含外部連結），整個 /wiki* surface 都該 no-referrer
function applyWikiHeaders(res: NextResponse): NextResponse {
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export function middleware(req: NextRequest): NextResponse | undefined {
  // 只處理 /wiki* 帶 ?t= 的請求；其他 pass through（但仍套 no-referrer header）
  const t = req.nextUrl.searchParams.get("t");
  if (!t) {
    // 沒帶 token，pass through，由 page 端用 verifyWikiAccess 認 cookie
    // 但仍套 no-referrer：page render 階段的 outbound 連結也不該帶 referrer
    return applyWikiHeaders(NextResponse.next());
  }

  // redirect 到 auth-magic 處理。把原 pathname + 剩餘 query（去掉 t=）
  // 編碼成 next 參數，讓 auth-magic 驗完 token 後 302 redirect 回 next。
  // pathname 一定以 / 開頭，且來自 /wiki/:path* matcher（auth-magic.sanitizeNext
  // 會再驗一次 next 是 /wiki* 子路徑，雙重防 open redirect）。
  const origSearch = req.nextUrl.search; // 含 leading "?"，可能為空字串
  // 移除 t=<token>（無論在第一個還是中間），保留其餘 query
  const cleanedSearch = origSearch
    .replace(/([?&])t=[^&]*(&|$)/, (_m, p1, p2) => (p2 === "&" ? p1 : ""))
    .replace(/\?$/, ""); // 若 t= 是唯一 param，去掉孤立的 "?"
  const nextValue = req.nextUrl.pathname + cleanedSearch;

  // 用獨立 URL 物件組目標：避免 nextUrl.clone() 在 rewrite/redirect 時
  // 內部 searchParams state 被 matcher quirk 干擾（1g rewrite 失敗的根因）。
  const target = new URL("/api/wiki/auth-magic", req.nextUrl.origin);
  target.searchParams.set("t", t);
  target.searchParams.set("next", nextValue);

  return applyWikiHeaders(NextResponse.redirect(target, 302));
}

export const config = {
  matcher: [
    // /wiki + /wiki/anything（不含 /api/* 因為 matcher 不匹配）
    "/wiki",
    "/wiki/:path*",
  ],
};
