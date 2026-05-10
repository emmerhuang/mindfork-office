// lib/dry-run.ts — Dry-run header support（給 Lens 做 attack/edge case 測試）
//
// Phase: 1c (P1-3.5 by Forge — 新建)
// Phase: 1e (P3-NEW Lens 1d 修補 by Forge — audit trail)
// Spec source: 老大派工 Phase 1c #2「加 dry-run header（給 Lens 用）」
//              + Lens 1d 報告 P3-NEW: dry-run 在 prod 也認、無 audit trail
//
// 用法：
//   - 任何 write endpoint（submit / decide / token issue / token revoke）：
//       const dry = isDryRun(req);
//       ... 跑完所有 validation
//       if (dry) {
//         const audit = requireDryRunAudit(req);
//         if (!audit.ok) return jsonError(400, audit.error, { hint: audit.hint });
//         return dryRunResponse({ would_insert: true, ... });
//       }
//       ... 真的 INSERT/UPDATE
//
// 規則：
//   - Lens 要設 X-Lens-DryRun: 1（或任何 truthy 值）才生效
//   - production 也允許 dry-run（不限 NODE_ENV），因為 Lens 也要能驗 prod 部署
//   - dry-run 不該被攻擊者用來繞 HMAC 等驗證 — 所以 endpoint 必須先做 HMAC verify
//     再判斷 dry-run，不可顛倒。本 lib 只提供 helper，順序由 caller 守。
//   - dry-run response 永遠回 200 OK + JSON body，含 `dry_run: true` 旗標方便 caller 判斷
//
// Lens 1d P3-NEW 修補（2026-05-10 Phase 1e）：
//   - dry-run 必須帶 X-Lens-Reason 標明用途（否則 400），讓未來 audit log 有 trace
//   - 每次 dry-run 都 console.error 一行，含 reason / IP / UA — 容器 stdout 即留 trace
//   - 攻擊者拿到 HMAC + cookie 也無法「無聲探測」，每次留 server-side 紀錄

import { NextRequest, NextResponse } from "next/server";

const DRY_RUN_HEADER = "x-lens-dryrun";
const DRY_RUN_REASON_HEADER = "x-lens-reason";

/** 判斷 request 是否帶 dry-run header */
export function isDryRun(req: NextRequest): boolean {
  const v = req.headers.get(DRY_RUN_HEADER);
  if (!v) return false;
  // truthy 值：1 / true / yes（不分大小寫）
  const norm = v.trim().toLowerCase();
  return norm === "1" || norm === "true" || norm === "yes";
}

/**
 * Audit guard：dry-run request 必須帶 X-Lens-Reason header，且記 server log。
 *
 * 設計邏輯（Lens 1d P3-NEW）：
 *   - 攻擊者拿到 HMAC + admin cookie 後可無限制 dry-run 探測 endpoint 行為
 *   - 加 audit reason header 強制非匿名：每次 dry-run 都留 reason + IP + UA 在 server log
 *   - 沒帶 reason → 400（不執行 dry-run，避免「忘了帶」變成繞道）
 *
 * 用法：
 *   if (isDryRun(req)) {
 *     const audit = requireDryRunAudit(req);
 *     if (!audit.ok) return jsonError(400, audit.error, { hint: audit.hint });
 *     return dryRunResponse({ ... });
 *   }
 *
 * @returns { ok: true, reason } 帶 reason 已 log；{ ok: false, error, hint } 沒帶 reason
 */
export function requireDryRunAudit(
  req: NextRequest,
):
  | { ok: true; reason: string }
  | { ok: false; error: string; hint: string } {
  const reason = req.headers.get(DRY_RUN_REASON_HEADER);
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return {
      ok: false,
      error: "dry_run_reason_required",
      hint: "X-Lens-Reason header required for dry-run requests (audit trail)",
    };
  }
  // 上限避免 log 灌爆
  const trimmed = reason.trim().slice(0, 256);

  // Lens 1e P3-NEW-3：sanitize control chars (含 \n, \r, \t, ESC) 防 log 注入。
  // 攻擊者帶 reason="real\n[ERROR] FAKE LOG" 會讓 log 解析器混淆，誤認為兩行。
  // 規範：U+0000-U+001F + DEL (U+007F) 全替換為空格；保留可見 ASCII + UTF-8 多位元組。
  // eslint-disable-next-line no-control-regex
  const safeReason = trimmed.replace(/[\x00-\x1f\x7f]/g, " ");

  // 取 IP（Vercel: x-forwarded-for / x-real-ip / 本機 fallback）
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip") ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  const url = req.nextUrl?.pathname ?? "unknown";
  const method = req.method;
  // UA 也 sanitize（user-agent 同樣由 client 控制）
  // eslint-disable-next-line no-control-regex
  const safeUa = ua.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 128);

  // server-side log；Vercel function logs / 本機 stdout 都會收到
  console.error(
    `[DRY-RUN] ${method} ${url} reason="${safeReason}" ip=${ip} ua="${safeUa}"`,
  );

  // 回給 caller 仍是 trimmed（未 sanitize），維持原語意；safeReason 只用於 log
  return { ok: true, reason: trimmed };
}

/**
 * 回傳 dry-run 成功回應。
 *
 * @param details 要 echo 給 caller 的 dry-run 詳情（如預估會 INSERT 哪些欄位）
 *                必含 `would_*` 開頭的 boolean 旗標說明會發生什麼
 */
export function dryRunResponse(
  details: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      dry_run: true,
      ...details,
    },
    { status: 200 },
  );
}
