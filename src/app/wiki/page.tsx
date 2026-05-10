// app/wiki/page.tsx — 老大儀表板（wiki 動作 + 提問機制 整合一頁）
//
// Phase 2 後續整合（Forge 2026-05-10）— 老大要求「整合在一頁不要切換」。
//
// 一頁兩個 section（皆預設可見、不用 tab，老大手機可直接 scroll）：
//   - Section A：wiki 動作清單（原 /wiki 內容；三 group：請決定 / 請看一眼 / 不用你管）
//   - Section B：提問清單（原 /wiki/questions 內容；兩 group：等你答 / 最近 7 天已答）
//
// 雙 capability 邏輯（不動 schema，不改 token 結構；走簡單方案）：
//   - mfo_admin (admin password)              → root credential：兩 section 都可操作
//   - wiki_admin_token w/ capability='wiki_action' → A 可操作，B 唯讀+提示
//   - wiki_admin_token w/ capability='questions'   → B 可操作，A 唯讀+提示
//   - 兩條都失敗                              → 401 UnauthorizedView
//
// 唯讀 section：卡片改 div（不可點），底部 footer 提示「需要另一個連結登入操作」。
// 詳情頁 (/wiki/[id], /wiki/questions/[id]) 仍各自做 capability 檢查；
// 但儀表板上把不可操作的卡片變不可點，避免老大白點被擋（UX）。
//
// quick-stats badge（header 下方）：
//   - N 件 wiki 等你批准（pending_review 數）
//   - N 件提問等你答（pending 數）
//   - N 件不用你管已自動完成（auto_pending 數，老大早期 #6414 就要這顆）
//
// Spec source:
//   - reports/architecture/memory-webapp-architecture-v2-20260509.md §B.2 §F
//   - reports/architecture/memory-webapp-phase2-questions-spec-20260510.md
//   - reports/architecture/memory-webapp-phase2-lego-adr-20260510.md §A §E

import Link from "next/link";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

import {
  actionTypeLabel,
  layerLabel,
  listActionRequestsForReview,
  statusLabel,
  type WikiRequestListItem,
} from "@/lib/memory-data";
import { listQuestionsForBoss, type QuestionListItem } from "@/lib/questions-data";
import { verifyAdminCookie } from "@/lib/admin-auth";
import { verifyTokenCapability } from "@/lib/token-capability";
import { WIKI_TOKEN_COOKIE } from "@/lib/wiki-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function makeServerRequest(): Promise<NextRequest> {
  const h = await headers();
  const cookieHeader = h.get("cookie") ?? "";
  return new NextRequest("http://localhost/wiki", {
    headers: { cookie: cookieHeader },
  });
}

/**
 * 計算這個 request 對 A / B 兩 section 的可操作性。
 *
 * 回傳：
 *   - canActWiki：A 區（wiki actions）可否操作（true=可以，false=唯讀，null=完全沒登入）
 *   - canActQuestions：B 區（questions）可否操作
 *
 * Auth matrix：
 *   admin password         → canActWiki=true,  canActQuestions=true
 *   token w/ wiki_action    → canActWiki=true,  canActQuestions=false (唯讀)
 *   token w/ questions      → canActWiki=false (唯讀), canActQuestions=true
 *   no/invalid auth         → both null（顯示登入提示）
 */
async function resolveCapabilities(req: NextRequest): Promise<{
  canActWiki: boolean | null;
  canActQuestions: boolean | null;
  authReason?: string;
}> {
  if (verifyAdminCookie(req)) {
    return { canActWiki: true, canActQuestions: true };
  }
  const tokenStr = req.cookies.get(WIKI_TOKEN_COOKIE)?.value;
  if (!tokenStr) {
    return { canActWiki: null, canActQuestions: null, authReason: "no_auth" };
  }
  // 兩種 capability 各驗一次 — 同一 token 只可能對到一種 capability
  const wikiCheck = await verifyTokenCapability(tokenStr, "wiki_action");
  if (wikiCheck.ok) {
    return { canActWiki: true, canActQuestions: false };
  }
  const qCheck = await verifyTokenCapability(tokenStr, "questions");
  if (qCheck.ok) {
    return { canActWiki: false, canActQuestions: true };
  }
  // 兩條都失敗 — 用 wikiCheck 的 reason（兩條 reason 通常一致：token_expired/revoked/etc）
  return {
    canActWiki: null,
    canActQuestions: null,
    authReason: wikiCheck.ok === false ? wikiCheck.reason : "auth_failed",
  };
}

export default async function WikiDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const sp = await searchParams;
  const req = await makeServerRequest();
  const caps = await resolveCapabilities(req);

  // 完全沒登入 → 401 page
  if (caps.canActWiki === null && caps.canActQuestions === null) {
    return <UnauthorizedView reason={sp.reason ?? caps.authReason} />;
  }

  // Fetch wiki actions（兩 section 都展示資料；唯讀 section 只是不能點操作）
  const wikiItems = await listActionRequestsForReview();
  const reviewItems = wikiItems.filter((i) => i.status === "pending_review");
  const ackItems = wikiItems.filter((i) => i.status === "applied_pending_ack");
  const autoItems = wikiItems.filter((i) => i.status === "auto_pending");

  // Fetch questions（同上邏輯）
  let qPending: QuestionListItem[] = [];
  let qAnswered: QuestionListItem[] = [];
  let qDbError: string | null = null;
  try {
    const r = await listQuestionsForBoss();
    qPending = r.pending;
    qAnswered = r.recentlyAnswered;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    qDbError = /no such table/i.test(msg) ? "schema_pending" : "db_error";
  }

  return (
    <main className="min-h-screen bg-[#f5f1eb] px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">
            團隊事務一覽
          </h1>
          <p className="text-sm text-stone-600">
            等你批准的 wiki 更動 + 等你回答的提問，都在這頁
          </p>
          <QuickStats
            wikiReview={reviewItems.length}
            questionsPending={qDbError ? 0 : qPending.length}
            autoDone={autoItems.length}
          />
        </header>

        {/* Section A：wiki 動作 */}
        <SectionDivider title="團隊筆記更動" />
        {!caps.canActWiki && (
          <ReadOnlyBanner section="wiki 更動" hintLink="wiki" />
        )}
        {wikiItems.length === 0 ? (
          <WikiEmptyState />
        ) : (
          <div className="space-y-4">
            <ListGroup
              title="請決定（需要你批准才能動）"
              tone="review"
              items={reviewItems}
              clickable={!!caps.canActWiki}
            />
            <ListGroup
              title="請看一眼（成員做完了，等你確認）"
              tone="notify"
              items={ackItems}
              clickable={!!caps.canActWiki}
            />
            <ListGroup
              title="不用你管（成員自己處理中）"
              tone="auto"
              items={autoItems}
              clickable={!!caps.canActWiki}
            />
          </div>
        )}

        {/* Section B：提問機制 */}
        <SectionDivider title="成員提問" />
        {!caps.canActQuestions && (
          <ReadOnlyBanner section="提問" hintLink="questions" />
        )}
        {qDbError === "schema_pending" && <QuestionsSchemaPendingState />}
        {qDbError === "db_error" && <QuestionsDbErrorState />}
        {!qDbError &&
          qPending.length === 0 &&
          qAnswered.length === 0 && <QuestionsEmptyState />}
        {!qDbError && (qPending.length > 0 || qAnswered.length > 0) && (
          <div className="space-y-4">
            {qPending.length > 0 && (
              <QuestionListGroup
                title={`等你答（${qPending.length}）`}
                tone="pending"
                items={qPending}
                clickable={!!caps.canActQuestions}
                kind="pending"
              />
            )}
            {qAnswered.length > 0 && (
              <QuestionListGroup
                title={`最近 7 天已答（${qAnswered.length}）`}
                tone="answered"
                items={qAnswered}
                clickable={!!caps.canActQuestions}
                kind="answered"
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Layout sub-components ──────────────────────────────────────────

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <h2 className="text-base sm:text-lg font-semibold text-stone-800">
        {title}
      </h2>
      <div className="flex-1 h-px bg-stone-300" />
    </div>
  );
}

function QuickStats({
  wikiReview,
  questionsPending,
  autoDone,
}: {
  wikiReview: number;
  questionsPending: number;
  autoDone: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-xs pt-1">
      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800">
        {wikiReview} 件 wiki 等你批准
      </span>
      <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">
        {questionsPending} 件提問等你答
      </span>
      <span className="px-2 py-1 rounded-full bg-stone-100 text-stone-700">
        {autoDone} 件不用你管已自動完成
      </span>
    </div>
  );
}

function ReadOnlyBanner({
  section,
  hintLink,
}: {
  section: string;
  hintLink: "wiki" | "questions";
}) {
  const which = hintLink === "wiki" ? "「wiki 更動」" : "「提問」";
  return (
    <div className="rounded-lg border border-stone-300 bg-stone-100 p-3 text-xs text-stone-700">
      <span className="font-medium">這份{section}你目前看得到但不能操作。</span>
      <span className="ml-1 text-stone-600">
        要操作{section}的話，請告訴秘書長：「重發{which}的連結」。
      </span>
    </div>
  );
}

// ── Wiki action section ──────────────────────────────────────────

function ListGroup({
  title,
  tone,
  items,
  clickable,
}: {
  title: string;
  tone: "review" | "notify" | "auto";
  items: WikiRequestListItem[];
  clickable: boolean;
}) {
  if (items.length === 0) return null;
  const headerColor =
    tone === "review"
      ? "text-blue-700"
      : tone === "notify"
        ? "text-amber-700"
        : "text-stone-600";
  return (
    <section className="space-y-2">
      <h3 className={`text-sm font-semibold ${headerColor}`}>
        {title} ({items.length})
      </h3>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <RequestCard item={it} clickable={clickable} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequestCard({
  item,
  clickable,
}: {
  item: WikiRequestListItem;
  clickable: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-2 text-xs text-stone-500 mb-1.5">
        <span>#{item.id}</span>
        <span>·</span>
        <span>{item.owner}</span>
        <span>·</span>
        <time dateTime={new Date(item.createdAt).toISOString()}>
          {formatRelativeMs(item.createdAt)}
        </time>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
        <span className="text-sm font-medium text-stone-900">
          {actionTypeLabel(item.actionType)}
        </span>
        <span className="text-stone-400 text-sm">→</span>
        <code className="font-mono text-xs sm:text-sm break-all text-stone-700">
          {item.targetPage}
        </code>
      </div>

      {(item.whatChanged || item.whyChanged || item.impactScope) && (
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs text-stone-600 mb-2">
          {item.whatChanged && (
            <div>
              <dt className="font-medium text-stone-500">改了什麼</dt>
              <dd className="line-clamp-2">{item.whatChanged}</dd>
            </div>
          )}
          {item.whyChanged && (
            <div>
              <dt className="font-medium text-stone-500">為什麼</dt>
              <dd className="line-clamp-2">{item.whyChanged}</dd>
            </div>
          )}
          {item.impactScope && (
            <div>
              <dt className="font-medium text-stone-500">影響</dt>
              <dd className="line-clamp-2">{item.impactScope}</dd>
            </div>
          )}
        </dl>
      )}

      {item.justification && (
        <div className="text-xs text-stone-600 mb-2 italic line-clamp-2">
          理由：{item.justification}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-xs">
        <LayerBadge layer={item.decisionLayer} />
        <StatusBadge status={item.status} />
      </div>
    </>
  );

  if (clickable) {
    return (
      <Link
        href={`/wiki/${item.id}`}
        className="block rounded-lg bg-white shadow-sm p-4 hover:shadow-md active:bg-stone-50 transition-shadow"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="block rounded-lg bg-white shadow-sm p-4 opacity-70 cursor-not-allowed">
      {inner}
    </div>
  );
}

function LayerBadge({ layer }: { layer: WikiRequestListItem["decisionLayer"] }) {
  const color =
    layer === "auto"
      ? "bg-stone-100 text-stone-700"
      : layer === "notify"
        ? "bg-amber-100 text-amber-800"
        : "bg-blue-100 text-blue-800";
  return (
    <span className={`px-2 py-0.5 rounded-full ${color}`}>
      {layerLabel(layer)}
    </span>
  );
}

function StatusBadge({ status }: { status: WikiRequestListItem["status"] }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
      {statusLabel(status)}
    </span>
  );
}

function WikiEmptyState() {
  return (
    <section className="rounded-lg border border-stone-300 bg-stone-50 p-6 text-center">
      <p className="text-stone-600 text-sm">目前沒有要處理的事。</p>
      <p className="text-stone-500 text-xs mt-1">
        成員提出新的筆記更動時，會出現在這裡。
      </p>
    </section>
  );
}

// ── Question section ──────────────────────────────────────────

function QuestionListGroup({
  title,
  tone,
  items,
  clickable,
  kind,
}: {
  title: string;
  tone: "pending" | "answered";
  items: QuestionListItem[];
  clickable: boolean;
  kind: "pending" | "answered";
}) {
  const headerColor =
    tone === "pending" ? "text-blue-700" : "text-stone-600";
  return (
    <section className="space-y-2">
      <h3 className={`text-sm font-semibold ${headerColor}`}>{title}</h3>
      <ul className="space-y-2">
        {items.map((q) => (
          <li key={q.id}>
            <QuestionCard q={q} kind={kind} clickable={clickable} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuestionCard({
  q,
  kind,
  clickable,
}: {
  q: QuestionListItem;
  kind: "pending" | "answered";
  clickable: boolean;
}) {
  const tone =
    kind === "pending" ? "border-blue-200" : "border-stone-200 opacity-90";
  const inner = (
    <>
      <div className="flex items-center gap-2 text-xs text-stone-500 mb-1.5">
        <span>#{q.id}</span>
        <span>·</span>
        <span>{q.owner}</span>
        <span>·</span>
        <time dateTime={q.createdAt}>{formatRelativeIso(q.createdAt)}</time>
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
        {kind === "pending" && clickable && (
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
    </>
  );

  const baseCls = `block rounded-lg bg-white shadow-sm border ${tone} p-4`;
  if (clickable) {
    return (
      <Link
        href={`/wiki/questions/${q.id}`}
        className={`${baseCls} hover:shadow-md active:bg-stone-50 transition-shadow`}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className={`${baseCls} opacity-70 cursor-not-allowed`}>{inner}</div>
  );
}

function QuestionsEmptyState() {
  return (
    <section className="rounded-lg border border-stone-300 bg-stone-50 p-6 text-center">
      <p className="text-stone-600 text-sm">目前沒有要答的問題。</p>
      <p className="text-stone-500 text-xs mt-1">
        成員整理出 2 題以上的問題會出現在這裡。
      </p>
    </section>
  );
}

function QuestionsSchemaPendingState() {
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center">
      <p className="text-amber-800 text-sm font-medium">提問機制資料表尚未建立</p>
      <p className="text-amber-700 text-xs mt-1">
        Vault 還沒把 webapp_questions schema 上到這個資料庫。等 schema 落地後就會看到題目。
      </p>
    </section>
  );
}

function QuestionsDbErrorState() {
  return (
    <section className="rounded-lg border border-red-300 bg-red-50 p-6 text-center">
      <p className="text-red-800 text-sm font-medium">提問資料讀取失敗</p>
      <p className="text-red-700 text-xs mt-1">
        請告訴秘書長：「提問頁讀不到資料」，請她排查 Turso DB 狀態。
      </p>
    </section>
  );
}

// ── Auth / shared helpers ──────────────────────────────────────────

function UnauthorizedView({ reason }: { reason?: string }) {
  let msg = "請先登入";
  let hint = "從首頁輸入 admin 密碼，或請秘書長重發 magic link。";
  if (reason === "token_expired") {
    msg = "Magic link 已過期";
    hint = "請告訴秘書長：「memory webapp 連結過期了，重發一下」。";
  } else if (
    reason === "token_revoked_or_unknown" ||
    reason === "token_revoked" ||
    reason === "token_not_found"
  ) {
    msg = "Magic link 已失效";
    hint = "Token 已被撤銷或不存在。請告訴秘書長重發新連結。";
  } else if (reason && reason.startsWith("token_")) {
    msg = "Magic link 無效";
    hint = `原因：${reason.slice("token_".length)}。請告訴秘書長重發新連結。`;
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

function formatRelativeMs(ms: number): string {
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

function formatRelativeIso(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "?";
  return formatRelativeMs(ms);
}
