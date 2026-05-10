"use client";

// app/wiki/[id]/EditModal.tsx — Edit & Approve modal
//
// Phase: 1g (P1-14 by Forge — 新建)
// Source: 秘書長 Phase 1g Q2 派工「Edit modal（3-4h）：完整做，含 JSON 驗證 / mobile-first」
// 取代舊版 DecisionButtons.tsx 的 window.prompt() — 不夠用：
//   - mobile 上 prompt 文字框小、不能多行
//   - 沒有 JSON 驗證，老大隨便輸入會在 endpoint 端才被擋
//   - 沒法看原始 payload_new 對照修改
//
// 設計重點：
//   - mobile-first：手機上滿屏遮罩 + 大 textarea；桌機上 max-w-3xl 居中
//   - JSON 驗證：可選（payload_new 不一定是 JSON），UI 上有切換鈕
//   - 原 payload_new 顯示為唯讀對照（避免老大「猜」原值）
//   - 鍵盤友善：Esc 關閉，Ctrl/Cmd+Enter 送出
//   - 背景 click 不關閉（避免老大寫到一半誤點失去內容）— 必須點關閉鈕

import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  isOpen: boolean;
  originalPayload: string; // payload_new 的原值，給老大對照
  onClose: () => void;
  onSubmit: (editedPayload: string) => void; // 父層 fetch /api/wiki/decide
  isSubmitting: boolean;
  errorMsg?: string | null;
}

type ValidationMode = "json" | "freeform";

export default function EditModal({
  isOpen,
  originalPayload,
  onClose,
  onSubmit,
  isSubmitting,
  errorMsg,
}: Props) {
  const [edited, setEdited] = useState<string>("");
  const [mode, setMode] = useState<ValidationMode>("freeform");
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Modal open 時：初始化 edited = originalPayload，自動偵測是否 JSON
  useEffect(() => {
    if (isOpen) {
      setEdited(originalPayload);
      setLocalError(null);
      // 自動偵測：能 JSON.parse 就預設 json mode
      try {
        JSON.parse(originalPayload);
        setMode("json");
      } catch {
        setMode("freeform");
      }
      // focus 到 textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [isOpen, originalPayload]);

  // ESC 關閉
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, isSubmitting, onClose]);

  // 鎖 body scroll
  useEffect(() => {
    if (!isOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [isOpen]);

  const handleSubmit = useCallback(() => {
    setLocalError(null);
    if (!edited || edited.trim().length === 0) {
      setLocalError("payload 不可為空");
      return;
    }
    if (edited === originalPayload) {
      setLocalError("payload 沒有改變 — 直接點 Approve 不要走 Edit");
      return;
    }
    if (mode === "json") {
      try {
        JSON.parse(edited);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLocalError(`JSON 解析失敗：${msg}`);
        return;
      }
    }
    // 大小檢查：100KB（與後端 PAYLOAD_MAX_BYTES 對齊）
    const byteLen = new TextEncoder().encode(edited).length;
    if (byteLen > 102400) {
      setLocalError(`payload 太大：${byteLen} bytes > 100KB 上限`);
      return;
    }
    onSubmit(edited);
  }, [edited, originalPayload, mode, onSubmit]);

  // Ctrl/Cmd+Enter 送出
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isSubmitting) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  // Format JSON 鈕
  const handleFormat = () => {
    setLocalError(null);
    try {
      const parsed = JSON.parse(edited);
      setEdited(JSON.stringify(parsed, null, 2));
      setMode("json");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLocalError(`Format 失敗（JSON 解析錯誤）：${msg}`);
    }
  };

  const showError = localError || errorMsg;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-lg shadow-xl flex flex-col max-h-screen sm:max-h-[90vh]">
        {/* Header */}
        <header className="px-4 py-3 sm:px-6 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <h2 id="edit-modal-title" className="text-base sm:text-lg font-semibold text-stone-900">
            Edit & Approve
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-stone-500 hover:text-stone-800 disabled:opacity-50 px-2 py-1 -mr-2 text-xl leading-none"
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 space-y-4">
          <p className="text-xs sm:text-sm text-stone-600">
            修改老大的 payload，送出後會作為 <code className="font-mono bg-stone-100 px-1 rounded">payload_edited</code>{" "}
            連同 approve 一起寫入。worker 會以這個版本動 wiki 檔案。
          </p>

          {/* 模式切換 */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-stone-600">驗證模式：</span>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="mode"
                checked={mode === "json"}
                onChange={() => setMode("json")}
                disabled={isSubmitting}
              />
              <span>JSON（送出時驗）</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="mode"
                checked={mode === "freeform"}
                onChange={() => setMode("freeform")}
                disabled={isSubmitting}
              />
              <span>Freeform（不驗）</span>
            </label>
            {mode === "json" && (
              <button
                type="button"
                onClick={handleFormat}
                disabled={isSubmitting}
                className="ml-auto text-xs px-2 py-1 rounded border border-stone-300 hover:bg-stone-50 disabled:opacity-50"
              >
                格式化 JSON
              </button>
            )}
          </div>

          {/* 原值（唯讀，折疊） */}
          <details className="text-xs sm:text-sm">
            <summary className="cursor-pointer text-stone-600 select-none">
              查看原 payload（唯讀對照）
            </summary>
            <pre className="mt-2 p-3 rounded bg-stone-50 border border-stone-200 font-mono text-xs overflow-x-auto max-h-48">
              {originalPayload}
            </pre>
          </details>

          {/* 編輯區 */}
          <div className="space-y-1">
            <label htmlFor="edit-payload" className="block text-xs sm:text-sm font-medium text-stone-700">
              修改後的 payload
            </label>
            <textarea
              id="edit-payload"
              ref={textareaRef}
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              spellCheck={false}
              className="w-full min-h-[40vh] sm:min-h-[24rem] p-3 rounded border border-stone-300 font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-stone-50"
              placeholder={mode === "json" ? "貼上修改後的 JSON…" : "貼上修改後的內容…"}
            />
            <p className="text-xs text-stone-500">
              快捷鍵：<kbd className="font-mono">Ctrl/Cmd + Enter</kbd> 送出 ·
              <kbd className="font-mono ml-2">Esc</kbd> 關閉
            </p>
          </div>

          {/* Error */}
          {showError && (
            <div
              role="alert"
              className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs sm:text-sm text-red-800 whitespace-pre-wrap"
            >
              {showError}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-4 py-3 sm:px-6 border-t border-stone-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-md text-sm font-medium border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
          >
            {isSubmitting ? "送出中…" : "送出修改 + Approve"}
          </button>
        </footer>
      </div>
    </div>
  );
}
