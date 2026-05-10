// app/wiki/[id]/page.tsx — 單筆 wiki action request 詳情頁
//
// Phase 1b · P1-7 by Yuki（接手 Forge P1-2 placeholder）
//
// Spec source : reports/architecture/memory-webapp-architecture-v2-20260509.md §F
// Schema ref  : src/lib/db/schema.ts (Vault P1-1)
// Data layer  : src/lib/memory-data.ts（mock；Forge P1-3/P1-6 換 Drizzle query）
//
// 設計重點：
//   - Server Component 取資料，server-side render（Next.js 15 App Router）
//   - mobile-first Tailwind（老大可能手機點 magic link）
//   - 按鈕走 client component DecisionButtons，stub onClick → console.log + alert
//     Forge P1-4 把 endpoint 接好後 onClick 換成 fetch("/wiki/api/decide", ...)
//   - diff viewer 是 plain text ± 標記（Phase 1 範圍，不引 diff library）

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

import {
  computeDiff,
  getActionsForStatus,
  getRequestById,
  statusLabel,
  type DiffLine,
} from "@/lib/memory-data";
import { verifyWikiAccess } from "@/lib/wiki-auth";
import DecisionButtons from "./DecisionButtons";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function makeServerRequest(): Promise<NextRequest> {
  const h = await headers();
  const cookieHeader = h.get("cookie") ?? "";
  return new NextRequest("http://localhost/wiki", {
    headers: { cookie: cookieHeader },
  });
}

export default async function WikiActionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const authReq = await makeServerRequest();
  const ok = await verifyWikiAccess(authReq);
  if (!ok) {
    // 未授權：redirect 到 list 頁讓使用者看到 UnauthorizedView 訊息
    redirect("/wiki?reason=token_expired");
  }
  const req = await getRequestById(id);
  if (!req) notFound();

  const diff = computeDiff(req.payloadOld, req.payloadNew);
  const buttons = getActionsForStatus(req.status);

  return (
    <main className="min-h-screen bg-[#f5f1eb] text-gray-800 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* ── Header ───────────────────────────────────── */}
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>#{req.id}</span>
            <span>·</span>
            <span>{req.owner}</span>
            <span>·</span>
            <time dateTime={new Date(req.createdAt).toISOString()}>
              {formatRelative(req.createdAt)}
            </time>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold break-words">
            {req.actionType.replace(/_/g, " ")}{" "}
            <span className="text-gray-500 font-normal">→</span>{" "}
            <code className="font-mono text-base sm:text-lg break-all">
              {req.targetPage}
            </code>
          </h1>
          <StatusBadge label={statusLabel(req.status)} layer={req.decisionLayer} />
        </header>

        {/* ── Related pages（merge/split 才有） ───────── */}
        {req.relatedPages && req.relatedPages.length > 0 && (
          <Section title="Related pages">
            <ul className="text-sm space-y-1">
              {req.relatedPages.map((p) => (
                <li key={p}>
                  <code className="font-mono break-all">{p}</code>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── 三欄白話文 ─────────────────────────────── */}
        {(req.whatChanged || req.whyChanged || req.impactScope) && (
          <Section title="白話文說明">
            <dl className="grid grid-cols-1 gap-3 text-sm">
              <NarrativeRow label="改了什麼" value={req.whatChanged} />
              <NarrativeRow label="為什麼改" value={req.whyChanged} />
              <NarrativeRow label="影響範圍" value={req.impactScope} />
            </dl>
          </Section>
        )}

        {/* ── 要問層必填的 justification ─────────────── */}
        {req.justification && (
          <Section title="申請理由 (justification)">
            <p className="text-sm whitespace-pre-wrap">{req.justification}</p>
          </Section>
        )}

        {/* ── reject reason（rejected 時才有） ────────── */}
        {req.rejectReason && (
          <Section title="拒絕原因" tone="danger">
            <p className="text-sm whitespace-pre-wrap">{req.rejectReason}</p>
          </Section>
        )}

        {/* ── Diff viewer ─────────────────────────────── */}
        <Section title={`Diff (${diff.length} 行)`}>
          <DiffView lines={diff} />
        </Section>

        {/* ── Backup path ─────────────────────────────── */}
        {req.backupPath && (
          <Section title="Backup">
            <code className="font-mono text-xs break-all text-gray-600">
              {req.backupPath}
            </code>
          </Section>
        )}

        {/* ── Action buttons ──────────────────────────── */}
        {buttons.length > 0 ? (
          <DecisionButtons
            requestId={req.id}
            buttons={buttons}
            originalPayload={req.payloadNew}
          />
        ) : (
          <div className="text-sm text-gray-500 italic py-4">
            目前狀態無可操作動作。
          </div>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ──────────────────────────────────────────

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  const titleColor = tone === "danger" ? "text-red-700" : "text-gray-700";
  return (
    <section className="rounded-lg bg-white shadow-sm p-4 sm:p-5">
      <h2 className={`text-sm font-semibold mb-2 ${titleColor}`}>{title}</h2>
      {children}
    </section>
  );
}

function NarrativeRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <dt className="text-xs sm:text-sm font-medium text-gray-500 sm:w-20 shrink-0">
        {label}
      </dt>
      <dd className="text-sm whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function StatusBadge({
  label,
  layer,
}: {
  label: string;
  layer: "auto" | "notify" | "review";
}) {
  const layerColor =
    layer === "auto"
      ? "bg-gray-100 text-gray-700"
      : layer === "notify"
        ? "bg-amber-100 text-amber-800"
        : "bg-blue-100 text-blue-800";
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className={`px-2 py-0.5 rounded-full ${layerColor}`}>
        {layer} layer
      </span>
      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
        {label}
      </span>
    </div>
  );
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  if (lines.length === 0) {
    return <p className="text-sm text-gray-500 italic">(無差異)</p>;
  }
  return (
    <pre className="font-mono text-xs leading-relaxed overflow-x-auto rounded bg-gray-50 p-3 max-h-96">
      {lines.map((l, i) => (
        <div
          key={i}
          className={
            l.kind === "add"
              ? "text-green-700 bg-green-50"
              : l.kind === "del"
                ? "text-red-700 bg-red-50 line-through decoration-red-300"
                : "text-gray-600"
          }
        >
          <span className="select-none mr-2">
            {l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}
          </span>
          {l.text || " "}
        </div>
      ))}
    </pre>
  );
}

function formatRelative(ms: number): string {
  const diffMs = Date.now() - ms;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  return `${day} 天前`;
}
