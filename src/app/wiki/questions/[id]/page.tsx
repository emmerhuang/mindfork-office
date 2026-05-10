// app/wiki/questions/[id]/page.tsx — 老大端單題詳情頁
//
// Phase: 2 (Forge — 新建)
// Spec  : phase2 spec D-4 / D-5 / D-16 / D-17
// ADR   : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §B / §D.2

import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

import { getQuestionById } from "@/lib/questions-data";
import { verifyAdminCookie } from "@/lib/admin-auth";
import { verifyTokenCapability } from "@/lib/token-capability";
import { WIKI_TOKEN_COOKIE } from "@/lib/wiki-auth";
import AnswerForm from "./AnswerForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function makeServerRequest(): Promise<NextRequest> {
  const h = await headers();
  const cookieHeader = h.get("cookie") ?? "";
  const fakeUrl = "http://localhost/wiki/questions/[id]";
  return new NextRequest(fakeUrl, { headers: { cookie: cookieHeader } });
}

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const req = await makeServerRequest();
  // Vault turso-005 已 LIVE。雙路徑：admin password (root) 或 wiki_admin_token w/ capability='questions'
  let ok = verifyAdminCookie(req);
  if (!ok) {
    const tokenStr = req.cookies.get(WIKI_TOKEN_COOKIE)?.value;
    const cap = await verifyTokenCapability(tokenStr, "questions");
    ok = cap.ok;
  }
  if (!ok) {
    return (
      <main className="min-h-screen bg-[#f5f1eb] px-4 py-10 sm:px-8 flex items-center justify-center">
        <section className="rounded-lg border border-stone-300 bg-white shadow-sm p-6 max-w-md w-full text-center space-y-3">
          <h1 className="text-lg font-semibold text-stone-900">請先登入</h1>
          <p className="text-sm text-stone-600">
            從首頁輸入 admin 密碼，或請秘書長重發 magic link。
          </p>
        </section>
      </main>
    );
  }

  let q;
  try {
    q = await getQuestionById(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such table/i.test(msg)) {
      return (
        <main className="min-h-screen bg-[#f5f1eb] px-4 py-10 sm:px-8 flex items-center justify-center">
          <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 max-w-md w-full text-center">
            <p className="text-amber-800">提問機制資料表尚未建立。</p>
          </section>
        </main>
      );
    }
    throw e;
  }
  if (!q) {
    notFound();
  }

  const isAnswered = q.status !== "pending";
  const answeredOptionLabel = q.answeredOption
    ? q.options.find((o) => o.key === q.answeredOption)?.label ?? q.answeredOption
    : null;

  return (
    <main className="min-h-screen bg-[#f5f1eb] px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Back link */}
        <Link
          href="/wiki/questions"
          className="text-xs text-stone-500 hover:text-stone-700"
        >
          ← 回提問清單
        </Link>

        {/* Meta */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <span>#{q.id}</span>
            <span>·</span>
            <span>{q.owner}</span>
            <span>·</span>
            <span>{formatRelative(q.createdAt)}</span>
            {isAnswered && (
              <>
                <span>·</span>
                <span className="text-emerald-600">你已答</span>
              </>
            )}
          </div>
        </div>

        {/* Question body */}
        <section className="bg-white shadow-sm rounded-lg p-5 space-y-4">
          <h1 className="text-base sm:text-lg font-semibold text-stone-900 whitespace-pre-wrap">
            {q.questionBody}
          </h1>

          {/* D-5：影響說明前置（決策前同畫面可見） */}
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
            <h2 className="text-xs font-semibold text-amber-900 mb-1">
              這個決定的可能影響
            </h2>
            <p className="text-sm text-amber-800 whitespace-pre-wrap">
              {q.impactSummary}
            </p>
          </div>

          {/* hypothesis（如有） */}
          {q.hypothesis && (
            <div className="rounded-md bg-stone-50 border border-stone-200 p-3">
              <h2 className="text-xs font-semibold text-stone-600 mb-1">
                {q.owner} 的建議答案
              </h2>
              <p className="text-sm text-stone-700 whitespace-pre-wrap">
                {q.hypothesis}
              </p>
            </div>
          )}
        </section>

        {/* Answer area */}
        {isAnswered ? (
          <section className="bg-white shadow-sm rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-emerald-700">你的答覆</h2>
            <div className="text-sm">
              <span className="font-medium text-stone-700">選擇：</span>
              <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs">
                {answeredOptionLabel}
              </span>
            </div>
            {q.answerNote && (
              <div className="text-sm whitespace-pre-wrap text-stone-700">
                <span className="font-medium">補充說明：</span>
                <span className="ml-2">{q.answerNote}</span>
              </div>
            )}
            <p className="text-xs text-stone-500">
              答完不可改動（守 audit trail）。如要更新答覆，請成員開新題覆蓋。
            </p>
          </section>
        ) : (
          <AnswerForm
            questionId={q.id}
            options={q.options}
            initialNoteHint=""
          />
        )}
      </div>
    </main>
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
