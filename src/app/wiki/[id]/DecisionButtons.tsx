"use client";

// app/wiki/[id]/DecisionButtons.tsx
//
// Phase 1d (P1-6 by Forge): 把 Yuki 的 stub onClick 接到 /api/wiki/decide。
//   - approve / ack：直接打 endpoint，無 reason
//   - reject：必填 reject_reason（用 prompt() 蒐集；endpoint 也會擋空）
//   - rollback：建議填 rollback_reason（用 prompt() 蒐集）
//   - edit：approve + payload_edited（暫時走 prompt 給 textarea，Phase 2 換 modal）
//   - 完成後 router.refresh() 重抓 server component（含 list page）
//
// Phase 1g (P1-14 by Forge): edit 從 prompt() 換成 EditModal（多行 textarea +
//   JSON 驗證 + mobile-first）。reject / rollback 仍用 prompt() — 短理由 prompt 就夠，
//   modal 過度設計。
//
// 錯誤處理：endpoint 回 401/409 需要明顯顯示給使用者。用 alert 是 Phase 1 範圍可接受。

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ButtonConfig } from "@/lib/memory-data";
import EditModal from "./EditModal";

interface Props {
  requestId: number;
  buttons: ButtonConfig[];
  /** payload_new 原值，給 EditModal 顯示對照 + 初始值 */
  originalPayload: string;
}

interface DecidePayload {
  request_id: number;
  action: ButtonConfig["kind"] | "approve"; // edit 也是 approve（帶 payload_edited）
  reject_reason?: string;
  rollback_reason?: string;
  payload_edited?: string;
}

export default function DecisionButtons({
  requestId,
  buttons,
  originalPayload,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // 共用：打 /api/wiki/decide
  const callDecide = async (payload: DecidePayload): Promise<{ ok: boolean; errorText?: string }> => {
    let res: Response;
    try {
      res = await fetch("/api/wiki/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // server-side cookie 由 browser 自動帶（mfo_admin or wiki_admin_token）
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, errorText: `網路錯誤：${msg}` };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = { error: "non_json_response" };
    }

    if (!res.ok) {
      const err =
        (body && typeof body === "object" && "error" in body
          ? String((body as Record<string, unknown>).error)
          : "unknown_error");
      const hint =
        (body && typeof body === "object" && "hint" in body
          ? String((body as Record<string, unknown>).hint)
          : null);
      const text = `[${res.status}] ${err}${hint ? `\n${hint}` : ""}`;
      // 401 通常是 cookie 過期 — 老大要重新登入或重發 magic link
      if (res.status === 401) {
        alert("連結已過期。請告訴秘書長：「memory webapp 連結過期了，重發一下」");
      }
      return { ok: false, errorText: text };
    }
    return { ok: true };
  };

  const handleClick = async (btn: ButtonConfig) => {
    setErrorMsg(null);

    // edit 走 modal，不在這裡同步處理
    if (btn.kind === "edit") {
      setEditError(null);
      setEditModalOpen(true);
      return;
    }

    // 蒐集 per-action 必填欄位
    let payload: DecidePayload;
    switch (btn.kind) {
      case "approve":
        payload = { request_id: requestId, action: "approve" };
        break;
      case "reject": {
        const reason = window.prompt("拒絕的原因（必填）：");
        if (!reason || !reason.trim()) {
          // 使用者按取消或留空 → 直接放棄，不打 endpoint
          return;
        }
        payload = {
          request_id: requestId,
          action: "reject",
          reject_reason: reason.trim(),
        };
        break;
      }
      case "ack":
        payload = { request_id: requestId, action: "ack" };
        break;
      case "rollback": {
        const reason = window.prompt("為什麼要復原（必填）：");
        if (!reason || !reason.trim()) {
          return;
        }
        payload = {
          request_id: requestId,
          action: "rollback",
          rollback_reason: reason.trim(),
        };
        break;
      }
    }

    const r = await callDecide(payload);
    if (!r.ok) {
      setErrorMsg(r.errorText ?? "unknown_error");
      return;
    }
    // 成功：refresh server component
    startTransition(() => {
      router.refresh();
    });
  };

  // EditModal onSubmit
  const handleEditSubmit = async (editedPayload: string) => {
    setEditError(null);
    setEditSubmitting(true);
    const r = await callDecide({
      request_id: requestId,
      action: "approve",
      payload_edited: editedPayload,
    });
    setEditSubmitting(false);
    if (!r.ok) {
      setEditError(r.errorText ?? "unknown_error");
      return;
    }
    // 成功：關 modal + refresh
    setEditModalOpen(false);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <>
      <div className="space-y-2">
        {errorMsg && (
          <div
            role="alert"
            className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 whitespace-pre-wrap"
          >
            {errorMsg}
          </div>
        )}
        <div className="flex flex-wrap gap-2 sticky bottom-0 bg-[#f5f1eb] py-3 -mx-4 px-4 sm:static sm:mx-0 sm:px-0 sm:py-0">
          {buttons.map((btn) => (
            <button
              key={btn.kind}
              type="button"
              onClick={() => handleClick(btn)}
              disabled={isPending || editSubmitting}
              className={buttonClass(btn.variant, isPending || editSubmitting)}
            >
              {btn.label}
            </button>
          ))}
          {isPending && (
            <span className="text-xs text-stone-500 self-center ml-1">
              處理中…
            </span>
          )}
        </div>
      </div>

      <EditModal
        isOpen={editModalOpen}
        originalPayload={originalPayload}
        onClose={() => setEditModalOpen(false)}
        onSubmit={handleEditSubmit}
        isSubmitting={editSubmitting}
        errorMsg={editError}
      />
    </>
  );
}

function buttonClass(
  variant: "primary" | "danger" | "ghost",
  disabled: boolean,
): string {
  const base =
    "px-4 py-2 rounded-md text-sm font-medium transition-colors min-w-24 sm:min-w-32 disabled:opacity-50 disabled:cursor-not-allowed";
  switch (variant) {
    case "primary":
      return `${base} bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800${disabled ? "" : ""}`;
    case "danger":
      return `${base} bg-red-600 text-white hover:bg-red-700 active:bg-red-800`;
    case "ghost":
      return `${base} border border-gray-300 text-gray-700 hover:bg-gray-100 active:bg-gray-200`;
  }
}
