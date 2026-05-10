// app/wiki/questions/page.tsx — 老大端題目清單頁
//
// Phase: 2 (Forge — 新建)
// Spec  : phase2 spec D-4 / D-5
// ADR   : reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §A / §F.1
//
// 顯示策略：
//   - 上方：等老大答（pending；按 createdAt ASC，最舊的先答）
//   - 下方：最近 7 天已答的（recently_answered；按 answeredAt DESC）
//
// 每張卡片顯示：
//   - meta: #id / owner / 多久前
//   - 題目主體
//   - impact_summary（D-5 前置；不必點進去就看到影響）
//   - hypothesis（如有）
//   - 選項數量提示（「2 個選項」「3 個選項」）
//   - 點進去 → /wiki/questions/[id]

import Link from "next/link";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

import { listQuestionsForBoss, type QuestionListItem } from "@/lib/questions-data";
import { verifyAdminCookie } from "@/lib/admin-auth";
import { verifyTokenCapability } from "@/lib/token-capability";
import { WIKI_TOKEN_COOKIE } from "@/lib/wiki-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function makeServerRequest(): Promise<NextRequest> {
  const h = await headers();
  const cookieHeader = h.get("cookie") ?? "";
  const fakeUrl = "http://localhost/wiki/questions";
  return new NextRequest(fakeUrl, { headers: { cookie: cookieHeader } });
}

export default async function QuestionsListPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const sp = await searchParams;
  const req = await makeServerRequest();
  // Vault turso-005 已 LIVE。雙路徑：admin password (root) 或 wiki_admin_token w/ capability='questions'
  let ok = verifyAdminCookie(req);
  if (!ok) {
    const tokenStr = req.cookies.get(WIKI_TOKEN_COOKIE)?.value;
    const cap = await verifyTokenCapability(tokenStr, "questions");
    ok = cap.ok;
  }
  if (!ok) {
    return <UnauthorizedView reason={sp.reason} />;
  }

  let pending: QuestionListItem[] = [];
  let recentlyAnswered: QuestionListItem[] = [];
  let dbError: string | null = null;
  try {
    const result = await listQuestionsForBoss();
    pending = result.pending;
    recentlyAnswered = result.recentlyAnswered;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such table/i.test(msg)) {
      dbError = "schema_pending"; // Vault migration 027 / turso-004 未落
    } else {
      dbError = "db_error";
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f1eb] px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">
            成員提問清單
          </h1>
          <p className="text-sm text-stone-600">
            成員整理出至少 2 題需要你決定的問題會送到這裡，可以批次處理
          </p>
          {!dbError && (
            <div className="flex flex-wrap gap-2 text-xs pt-1">
              <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                等你答 {pending.length}
              </span>
              <span className="px-2 py-1 rounded-full bg-stone-100 text-stone-700">
                最近 7 天已答 {recentlyAnswered.length}
              </span>
            </div>
          )}
        </header>

        {dbError === "schema_pending" && <SchemaPendingState />}
        {dbError === "db_error" && <DbErrorState />}

        {!dbError && pending.length === 0 && recentlyAnswered.length === 0 && (
          <EmptyState />
        )}

        {!dbError && pending.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-blue-700">
              等你答（{pending.length}）
            </h2>
            <ul className="space-y-2">
              {pending.map((q) => (
                <li key={q.id}>
                  <QuestionCard q={q} kind="pending" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {!dbError && recentlyAnswered.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-stone-600">
              最近 7 天已答（{recentlyAnswered.length}）
            </h2>
            <ul className="space-y-2">
              {recentlyAnswered.map((q) => (
                <li key={q.id}>
                  <QuestionCard q={q} kind="answered" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ──────────────────────────────────────────

function QuestionCard({
  q,
  kind,
}: {
  q: QuestionListItem;
  kind: "pending" | "answered";
}) {
  const tone =
    kind === "pending"
      ? "border-blue-200"
      : "border-stone-200 opacity-90";
  return (
    <Link
      href={`/wiki/questions/${q.id}`}
      className={`block rounded-lg bg-white shadow-sm border ${tone} p-4 hover:shadow-md active:bg-stone-50 transition-shadow`}
    >
      <div className="flex items-center gap-2 text-xs text-stone-500 mb-1.5">
        <span>#{q.id}</span>
        <span>·</span>
        <span>{q.owner}</span>
        <span>·</span>
        <time dateTime={q.createdAt}>{formatRelative(q.createdAt)}</time>
        {kind === "answered" && q.answeredAt && (
          <>
            <span>·</span>
            <span className="text-emerald-600">已答</span>
          </>
        )}
      </div>

      <p className="text-sm font-medium text-stone-900 mb-2 line-clamp-3">
        {q.questionBody}
      </p>

      <div className="text-xs text-stone-600 mb-2">
        <span className="font-medium text-stone-500">可能影響：</span>
        <span className="line-clamp-2">{q.impactSummary}</span>
      </div>

      {q.hypothesis && (
        <div className="text-xs text-stone-600 mb-2 italic line-clamp-2">
          {q.owner} 建議：{q.hypothesis}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
          {q.options.length} 個選項
        </span>
        {kind === "pending" && (
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            點進去答
          </span>
        )}
        {kind === "answered" && q.answeredOption && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            你選：
            {q.options.find((o) => o.key === q.answeredOption)?.label ??
              q.answeredOption}
          </span>
        )}
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <section className="rounded-lg border border-stone-300 bg-stone-50 p-6 text-center">
      <p className="text-stone-600 text-sm">目前沒有要答的問題。</p>
      <p className="text-stone-500 text-xs mt-1">
        成員整理出 2 題以上的問題會出現在這裡。
      </p>
    </section>
  );
}

function SchemaPendingState() {
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center">
      <p className="text-amber-800 text-sm font-medium">提問機制資料表尚未建立</p>
      <p className="text-amber-700 text-xs mt-1">
        Vault 還沒把 webapp_questions schema 上到這個資料庫。等 schema 落地後就會看到題目。
      </p>
    </section>
  );
}

function DbErrorState() {
  return (
    <section className="rounded-lg border border-red-300 bg-red-50 p-6 text-center">
      <p className="text-red-800 text-sm font-medium">資料讀取失敗</p>
      <p className="text-red-700 text-xs mt-1">
        請告訴秘書長：「提問頁讀不到資料」，請她排查 Turso DB 狀態。
      </p>
    </section>
  );
}

function UnauthorizedView({ reason }: { reason?: string }) {
  let msg = "請先登入";
  let hint = "從首頁輸入 admin 密碼，或請秘書長重發 magic link。";
  if (reason === "token_expired") {
    msg = "Magic link 已過期";
    hint = "請告訴秘書長：「提問頁連結過期了，重發一下」。";
  } else if (reason === "token_revoked_or_unknown") {
    msg = "Magic link 已失效";
    hint = "Token 已被撤銷或不存在。請告訴秘書長重發新連結。";
  }
  return (
    <main className="min-h-screen bg-[#f5f1eb] px-4 py-10 sm:px-8 flex items-center justify-center">
      <section className="rounded-lg border border-stone-300 bg-white shadow-sm p-6 max-w-md w-full text-center space-y-3">
        <h1 className="text-lg font-semibold text-stone-900">{msg}</h1>
        <p className="text-sm text-stone-600 whitespace-pre-wrap">{hint}</p>
      </section>
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
