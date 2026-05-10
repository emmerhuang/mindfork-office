// app/wiki/questions/page.tsx — 已併入 /wiki 儀表板
//
// Phase 2 後續整合（Forge 2026-05-10）— 老大要求「整合在一頁不要切換」。
// 原本獨立的提問清單頁已合併到 /wiki 儀表板的下半部 Section B。
// 為避免舊連結 / bookmark / Telegram 訊息失效，保留此 route 並 redirect 到 /wiki。
//
// 注意：詳情頁 /wiki/questions/[id] 仍保留獨立路由（老大從儀表板卡片點進去）。

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QuestionsListRedirect({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const sp = await searchParams;
  const qs = sp.reason ? `?reason=${encodeURIComponent(sp.reason)}` : "";
  redirect(`/wiki${qs}`);
}
