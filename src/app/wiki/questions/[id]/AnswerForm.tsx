"use client";

// app/wiki/questions/[id]/AnswerForm.tsx — 老大答題表單
//
// Phase: 2 (Forge — 新建)
// Spec  : phase2 spec D-4 / D-16
// ADR   : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §B
//
// UX 原則（D-4 統一）：
//   - 選項按鈕（必選）
//   - 補充說明 textarea（永遠可見、選填、≤ 500 字）
//   - 不分強度、不逐題指定
//
// 送出流程：
//   1. 驗 option 已選
//   2. POST /api/wiki/questions/answer
//   3. 成功 → router.refresh() 讓 server component 重抓「已答」視圖
//   4. 失敗 → red banner 提示

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { QuestionOption } from "@/lib/db/schema-questions";

const NOTE_MAX = 500;

export default function AnswerForm({
  questionId,
  options,
  initialNoteHint,
}: {
  questionId: number;
  options: QuestionOption[];
  initialNoteHint: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState(initialNoteHint);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!selected) {
      setError("請先選一個選項");
      return;
    }
    if (note.length > NOTE_MAX) {
      setError(`補充說明超過 ${NOTE_MAX} 字`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/wiki/questions/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            question_id: questionId,
            answered_option: selected,
            answer_note: note.length > 0 ? note : undefined,
          }),
        });
        if (!res.ok) {
          let detail = "送出失敗";
          try {
            const data = await res.json();
            detail = data.error ?? detail;
            if (data.hint) detail += ` (${data.hint})`;
          } catch {
            // ignore parse error
          }
          if (res.status === 401) {
            setError("登入過期，請重新登入或請秘書長重發 magic link");
          } else {
            setError(detail);
          }
          return;
        }
        // 成功 → refresh 讓 server component 重新讀取
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`網路錯誤：${msg}`);
      }
    });
  }

  return (
    <section className="bg-white shadow-sm rounded-lg p-5 space-y-4">
      <h2 className="text-sm font-semibold text-stone-900">回答這題</h2>

      {/* Options */}
      <div className="space-y-2">
        {options.map((opt) => {
          const isSel = selected === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSelected(opt.key)}
              disabled={isPending}
              className={`w-full text-left rounded-md border-2 px-4 py-3 transition-colors ${
                isSel
                  ? "border-blue-500 bg-blue-50"
                  : "border-stone-200 bg-white hover:border-stone-400"
              } ${isPending ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span className="text-xs text-stone-500 mr-2">{opt.key}</span>
              <span className="text-sm text-stone-900">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Note textarea */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-stone-600">
          補充說明（選填）
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isPending}
          rows={3}
          maxLength={NOTE_MAX + 50}
          placeholder="想補充什麼可以寫這裡（500 字內）"
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <div className="flex justify-end text-xs text-stone-500">
          <span className={note.length > NOTE_MAX ? "text-red-600" : ""}>
            {note.length}/{NOTE_MAX}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || !selected}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-stone-300 disabled:cursor-not-allowed"
      >
        {isPending ? "送出中..." : "送出答覆"}
      </button>
    </section>
  );
}
