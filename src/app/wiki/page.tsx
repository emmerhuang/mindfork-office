// app/wiki/page.tsx — Pending list 主畫面
//
// Phase 1d (P1-6 by Forge)：實作 list + 連到 Yuki P1-7 詳情頁
//
// 顯示策略（v2 doc §F + 老大 #6414 答 A）：
//   - pending_review（要問層 — 等老大批准）→ 高優先 group
//   - applied_pending_ack（告知層 — 已動完等老大確認）→ 中優先 group
//   - auto_pending（自主層 — worker 排隊中）→ 低優先 group（讓老大也看得到，不需操作）
//
// 每個 group 內按 createdAt DESC 排序。
//
// 為什麼不用 SWR / polling：
//   - Vercel serverless 不支援長連線；SWR 預設不啟用 server component
//   - server component server-side render，配合 router.refresh() 重抓即可（Yuki 詳情頁
//     按鈕點完後 router.refresh()，整頁 re-render 時 list 也會更新）
//   - 老大手機點 magic link，page load 是真實情境，極少需要 polling
//   - 真要 polling 等 Phase 1g 加 client-side fetch loop（30s revalidate）
//
// Phase 1g (P1-14 by Forge): 接 token middleware（query→cookie redirect）+ page-side
// auth check（mfo_admin OR wiki_admin_token，verifyWikiAccess）
//
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §B.2 §F

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
import { verifyWikiAccess } from "@/lib/wiki-auth";

export const dynamic = "force-dynamic";
// Phase 1 不分頁 / 不 cache；每次 navigate 都重抓。Phase 1g 加 client polling 才考慮 ISR
export const revalidate = 0;

/**
 * 把 server component 的 headers/cookies 轉成 NextRequest，給 verifyWikiAccess 用。
 * Next.js 15 server component 沒原生 NextRequest，但 verifyWikiAccess 只讀 cookie，
 * 用 headers() + cookies() 組一個最小 NextRequest shim。
 */
async function makeServerRequest(): Promise<NextRequest> {
  // 用 next/headers 拿 cookie，包成 NextRequest 給 verifyWikiAccess 用
  // verifyWikiAccess 只用 req.cookies.get(name)?.value，不需完整 NextRequest API
  const h = await headers();
  const cookieHeader = h.get("cookie") ?? "";
  // 構造 minimal Request → NextRequest 包裝
  const fakeUrl = "http://localhost/wiki";
  const req = new NextRequest(fakeUrl, {
    headers: { cookie: cookieHeader },
  });
  return req;
}

export default async function WikiPendingListPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const sp = await searchParams;
  const req = await makeServerRequest();
  const ok = await verifyWikiAccess(req);
  if (!ok) {
    return <UnauthorizedView reason={sp.reason} />;
  }
  const items = await listActionRequestsForReview();

  // 三 group 拆開（list 內已是 createdAt DESC，這裡只挑分組）
  const reviewItems = items.filter((i) => i.status === "pending_review");
  const ackItems = items.filter((i) => i.status === "applied_pending_ack");
  const autoItems = items.filter((i) => i.status === "auto_pending");

  return (
    <main className="min-h-screen bg-[#f5f1eb] px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">
            Memory Webapp
          </h1>
          <p className="text-sm text-stone-600">
            Wiki 維護動作審核 — 共 {items.length} 筆待處理
          </p>
        </header>

        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ListGroup
              title="要問：等老大批准"
              tone="review"
              items={reviewItems}
            />
            <ListGroup
              title="告知：等老大確認"
              tone="notify"
              items={ackItems}
            />
            <ListGroup
              title="自主：worker 排隊中"
              tone="auto"
              items={autoItems}
            />
          </>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ──────────────────────────────────────────

function ListGroup({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "review" | "notify" | "auto";
  items: WikiRequestListItem[];
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
      <h2 className={`text-sm font-semibold ${headerColor}`}>
        {title} ({items.length})
      </h2>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <RequestCard item={it} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequestCard({ item }: { item: WikiRequestListItem }) {
  return (
    <Link
      href={`/wiki/${item.id}`}
      className="block rounded-lg bg-white shadow-sm p-4 hover:shadow-md active:bg-stone-50 transition-shadow"
    >
      {/* 卡片頂部：meta info */}
      <div className="flex items-center gap-2 text-xs text-stone-500 mb-1.5">
        <span>#{item.id}</span>
        <span>·</span>
        <span>{item.owner}</span>
        <span>·</span>
        <time dateTime={new Date(item.createdAt).toISOString()}>
          {formatRelative(item.createdAt)}
        </time>
      </div>

      {/* 主標題：action_type → target_page */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
        <span className="text-sm font-medium text-stone-900">
          {actionTypeLabel(item.actionType)}
        </span>
        <span className="text-stone-400 text-sm">→</span>
        <code className="font-mono text-xs sm:text-sm break-all text-stone-700">
          {item.targetPage}
        </code>
      </div>

      {/* 三欄白話文（告知/要問層常有）：摘要顯示 */}
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

      {/* 要問層 justification */}
      {item.justification && (
        <div className="text-xs text-stone-600 mb-2 italic line-clamp-2">
          理由：{item.justification}
        </div>
      )}

      {/* 底部：layer + status badge */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        <LayerBadge layer={item.decisionLayer} />
        <StatusBadge status={item.status} />
      </div>
    </Link>
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

function EmptyState() {
  return (
    <section className="rounded-lg border border-stone-300 bg-stone-50 p-6 text-center">
      <p className="text-stone-600 text-sm">目前沒有待處理的 wiki 動作。</p>
      <p className="text-stone-500 text-xs mt-1">
        Subagent 提交新動作後會出現在這裡。
      </p>
    </section>
  );
}

function UnauthorizedView({ reason }: { reason?: string }) {
  let msg = "請先登入";
  let hint = "從首頁輸入 admin 密碼，或請秘書長重發 magic link。";
  if (reason === "token_expired") {
    msg = "Magic link 已過期";
    hint = "請告訴秘書長：「memory webapp 連結過期了，重發一下」。";
  } else if (reason === "token_revoked_or_unknown") {
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

function formatRelative(ms: number): string {
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return "未來"; // 防錯
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  return `${day} 天前`;
}
