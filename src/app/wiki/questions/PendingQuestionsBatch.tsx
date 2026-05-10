"use client";

// app/wiki/questions/PendingQuestionsBatch.tsx — 批次答題容器
//
// Phase: 2 (Forge — 全部填完一次送，2026-05-10 老大 #6496)
// Spec  : phase2 spec D-4 / D-16
//
// 設計：
//   - 整個 pending 區由一個 client component 管理「每題的選擇 + 補充說明」狀態
//   - 每題只顯示選項按鈕 + textarea，**移除每題的送出按鈕**
//   - 清單底部一個「全部送出（N 題已填）」按鈕，按下後並行 POST 已填題目
//
// 送出流程：
//   1. 收集所有「已選 option」的題目（沒選的略過）
//   2. Promise.allSettled 並行 POST /api/wiki/questions/answer
//   3. 全成功 → toast 訊息 + router.refresh()
//   4. 部分失敗 → 列出失敗題號；成功的不重送（state 中清掉已送）

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import type { QuestionListItem } from "@/lib/questions-data";

const NOTE_MAX = 500;

interface DraftEntry {
  selected: string | null;
  note: string;
}

interface SubmitResult {
  questionId: number;
  ok: boolean;
  error?: string;
}

export default function PendingQuestionsBatch({
  questions,
}: {
  questions: QuestionListItem[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, DraftEntry>>(() => {
    const init: Record<number, DraftEntry> = {};
    for (const q of questions) {
      init[q.id] = { selected: null, note: "" };
    }
    return init;
  });
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalInfo, setGlobalInfo] = useState<string | null>(null);
  const [perQuestionErrors, setPerQuestionErrors] = useState<Record<number, string>>({});
  const [isPending, startTransition] = useTransition();

  function setSelected(qid: number, key: string) {
    setDrafts((d) => ({ ...d, [qid]: { ...d[qid], selected: key } }));
    setPerQuestionErrors((e) => {
      if (!(qid in e)) return e;
      const next = { ...e };
      delete next[qid];
      return next;
    });
  }

  function setNote(qid: number, note: string) {
    setDrafts((d) => ({ ...d, [qid]: { ...d[qid], note } }));
  }

  // 已填 = 有選 option（note 不算）
  const filledIds = questions
    .map((q) => q.id)
    .filter((qid) => drafts[qid]?.selected !== null && drafts[qid]?.selected !== undefined);
  const filledCount = filledIds.length;

  // 任一題 note 超長就 disabled
  const anyNoteTooLong = questions.some((q) => (drafts[q.id]?.note.length ?? 0) > NOTE_MAX);

  async function handleBatchSubmit() {
    setGlobalError(null);
    setGlobalInfo(null);
    setPerQuestionErrors({});

    if (filledCount === 0) {
      setGlobalError("還沒有選任何題目的選項");
      return;
    }
    if (anyNoteTooLong) {
      setGlobalError(`有題目的補充說明超過 ${NOTE_MAX} 字`);
      return;
    }

    startTransition(async () => {
      const tasks = filledIds.map(async (qid): Promise<SubmitResult> => {
        const d = drafts[qid];
        try {
          const res = await fetch("/api/wiki/questions/answer", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              question_id: qid,
              answered_option: d.selected,
              answer_note: d.note.length > 0 ? d.note : undefined,
            }),
          });
          if (!res.ok) {
            let detail = `HTTP ${res.status}`;
            try {
              const data = await res.json();
              detail = data.error ?? detail;
              if (data.hint) detail += ` (${data.hint})`;
            } catch {
              // ignore
            }
            if (res.status === 401) {
              detail = "登入過期";
            }
            return { questionId: qid, ok: false, error: detail };
          }
          return { questionId: qid, ok: true };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { questionId: qid, ok: false, error: `網路錯誤：${msg}` };
        }
      });

      const results = await Promise.all(tasks);
      const succeeded = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);

      // 把成功的從 drafts 清掉（雖然 router.refresh 後 questions 也會更新，
      // 但中間部分失敗時要保留失敗題的選擇、不重送已成功的）
      if (succeeded.length > 0) {
        setDrafts((d) => {
          const next = { ...d };
          for (const r of succeeded) {
            if (next[r.questionId]) {
              next[r.questionId] = { selected: null, note: "" };
            }
          }
          return next;
        });
      }

      if (failed.length === 0) {
        setGlobalInfo(`已送出 ${succeeded.length} 題`);
        router.refresh();
      } else {
        const errMap: Record<number, string> = {};
        for (const f of failed) {
          errMap[f.questionId] = f.error ?? "送出失敗";
        }
        setPerQuestionErrors(errMap);
        if (succeeded.length > 0) {
          setGlobalError(
            `${succeeded.length} 題成功、${failed.length} 題失敗（失敗題目下方有錯誤訊息）`,
          );
          // 部分成功也 refresh，server 會把成功題從 pending 移走
          router.refresh();
        } else {
          setGlobalError(`全部 ${failed.length} 題送出失敗`);
        }
      }
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-blue-700">
        等你答（{questions.length}）
      </h2>

      <ul className="space-y-4">
        {questions.map((q) => {
          const draft = drafts[q.id] ?? { selected: null, note: "" };
          const perErr = perQuestionErrors[q.id];
          return (
            <li key={q.id}>
              <PendingQuestionCard
                q={q}
                selected={draft.selected}
                note={draft.note}
                disabled={isPending}
                onSelect={(key) => setSelected(q.id, key)}
                onNoteChange={(v) => setNote(q.id, v)}
                error={perErr}
              />
            </li>
          );
        })}
      </ul>

      {/* 底部總送出區 */}
      <div className="sticky bottom-2 z-10 rounded-lg bg-white shadow-md border border-blue-300 p-3 sm:p-4 space-y-2">
        {globalError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2.5 text-sm text-red-800">
            {globalError}
          </div>
        )}
        {globalInfo && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5 text-sm text-emerald-800">
            {globalInfo}
          </div>
        )}
        <button
          type="button"
          onClick={handleBatchSubmit}
          disabled={isPending || filledCount === 0 || anyNoteTooLong}
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-stone-300 disabled:cursor-not-allowed"
        >
          {isPending
            ? "送出中..."
            : `全部送出（${filledCount} 題已填）`}
        </button>
        {filledCount > 0 && filledCount < questions.length && (
          <p className="text-xs text-stone-500 text-center">
            未填的 {questions.length - filledCount} 題會留在這裡，下次再填
          </p>
        )}
      </div>
    </section>
  );
}

// ── Sub-components ──────────────────────────────────────────

function PendingQuestionCard({
  q,
  selected,
  note,
  disabled,
  onSelect,
  onNoteChange,
  error,
}: {
  q: QuestionListItem;
  selected: string | null;
  note: string;
  disabled: boolean;
  onSelect: (key: string) => void;
  onNoteChange: (v: string) => void;
  error?: string;
}) {
  return (
    <article className="rounded-lg bg-white shadow-sm border border-blue-200 p-4 sm:p-5 space-y-3">
      {/* meta */}
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <span>#{q.id}</span>
        <span>·</span>
        <span>{q.owner}</span>
        <span>·</span>
        <time dateTime={q.createdAt}>{formatRelative(q.createdAt)}</time>
      </div>

      {/* 題目主體 */}
      <p className="text-sm sm:text-base font-medium text-stone-900 whitespace-pre-wrap">
        {q.questionBody}
      </p>

      {/* D-5：影響說明 */}
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
        <h3 className="text-xs font-semibold text-amber-900 mb-1">
          這個決定的可能影響
        </h3>
        <p className="text-sm text-amber-800 whitespace-pre-wrap">
          {q.impactSummary}
        </p>
      </div>

      {q.hypothesis && (
        <div className="rounded-md bg-stone-50 border border-stone-200 p-3">
          <h3 className="text-xs font-semibold text-stone-600 mb-1">
            {q.owner} 的建議答案
          </h3>
          <p className="text-sm text-stone-700 whitespace-pre-wrap">
            {q.hypothesis}
          </p>
        </div>
      )}

      {/* 選項按鈕 */}
      <div className="space-y-2 pt-1">
        {q.options.map((opt) => {
          const isSel = selected === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSelect(opt.key)}
              disabled={disabled}
              className={`w-full text-left rounded-md border-2 px-3 py-2.5 transition-colors ${
                isSel
                  ? "border-blue-500 bg-blue-50"
                  : "border-stone-200 bg-white hover:border-stone-400"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span className="text-xs text-stone-500 mr-2">{opt.key}</span>
              <span className="text-sm text-stone-900">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* 補充說明 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-stone-600">
          補充說明（選填）
        </label>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          disabled={disabled}
          rows={2}
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
        <div className="rounded-md bg-red-50 border border-red-200 p-2.5 text-sm text-red-800">
          送出失敗：{error}
        </div>
      )}

      {/* 次要連結：詳情頁 deep-link */}
      <div className="flex justify-end pt-1">
        <Link
          href={`/wiki/questions/${q.id}`}
          className="text-xs text-stone-400 hover:text-stone-600"
        >
          在獨立頁開啟 →
        </Link>
      </div>
    </article>
  );
}

function formatRelative(isoString: string): string {
  const ms = new Date(isoString).getTime();
  if (!Number.isFinite(ms)) return "?";
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return "未來";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  return `${day} 天前`;
}
