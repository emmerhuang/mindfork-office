"use client";

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useStatusStream } from "@/hooks/useStatusStream";
import { DashboardChatCard } from "@/components/chat/DashboardChatCard";
import { ChatRoomModal } from "@/components/chat/ChatRoomModal";

const AssetLibraryModal = lazy(() => import("@/components/AssetLibraryModal"));

function formatTW(iso: string): string {
  const d = new Date(iso);
  const tw = new Date(d.getTime() + 8 * 3600000 - d.getTimezoneOffset() * 60000);
  // If the stored time already has +08:00, just extract HH:MM:SS
  const match = iso.match(/(\d{2}:\d{2}:\d{2})/);
  if (match && iso.includes("+08:00")) return match[1];
  return tw.toISOString().slice(11, 19);
}

interface Metrics {
  rateLimitPercent: number;
  pendingTasks: number;
  totalCostUsd?: number;
  modelName?: string;
  contextUsedPercent?: number;
  updatedAt?: string;
  resetAt?: string;
}

function shortModelName(name?: string): string {
  if (!name) return "--";
  // "Claude Opus 4.6 (1M context)" -> "Opus 4.6"
  const match = name.match(/(Opus|Sonnet|Haiku)\s*[\d.]+/i);
  return match ? match[0] : name.replace(/\s*\(.*?\)\s*/g, "");
}

interface MemberStatusEntry {
  status: string;
  task: string;
}

/** Fallback TEAM list used when memberProfiles haven't loaded from Turso yet */
const FALLBACK_TEAM = [
  { id: "boss", name: "老大", nameCn: "老大", role: "總指揮", primaryColor: "#8B0000" },
  { id: "secretary", name: "秘書長", nameCn: "秘書長", role: "協調與調度", primaryColor: "#1E3A5F" },
  { id: "sherlock", name: "Sherlock", nameCn: "Sherlock", role: "需求分析 + UX 設計", primaryColor: "#C0392B" },
  { id: "lego", name: "Lego", nameCn: "Lego", role: "架構 + 資料庫設計", primaryColor: "#E87D20" },
  { id: "vault", name: "Vault", nameCn: "Vault", role: "資安 + 效能工程師", primaryColor: "#2D5A3D" },
  { id: "forge", name: "Forge", nameCn: "Forge", role: "實作工程師", primaryColor: "#6C3483" },
  { id: "lens", name: "Lens", nameCn: "Lens", role: "測試工程師", primaryColor: "#2980B9" },
  { id: "waffles", name: "Waffles", nameCn: "Waffles", role: "柯基督察", primaryColor: "#F39C12" },
  { id: "grant", name: "Grant", nameCn: "Grant", role: "GG審查專員", primaryColor: "#2C3E50" },
  { id: "mika", name: "Mika", nameCn: "Mika", role: "貓耳女孩", primaryColor: "#C0C0C0" },
  { id: "yuki", name: "Yuki", nameCn: "Yuki", role: "實習程式設計師", primaryColor: "#FFB7C5" },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  idle: { label: "待命", color: "#6b7280" },
  working: { label: "工作中", color: "#22c55e" },
  meeting: { label: "開會中", color: "#3b82f6" },
  sleeping: { label: "休息中", color: "#a855f7" },
};

const CELEBRATE_COUNTS: Record<string, number> = { mika: 7, yuki: 7 };

function CelebrateAvatar({ id, name, emoji }: { id: string; name: string; emoji: string }) {
  const [frame, setFrame] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCount = CELEBRATE_COUNTS[id] ?? 4;

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setFrame(f => (f + 1) % frameCount);
    }, 200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [frameCount]);

  // Atlas layout: static(4) + walk(16) + celebrate(4+) = celebrate starts at index 20
  // Each frame is 180x180, laid out horizontally in a single row
  // Scale atlas so each frame becomes 120x120, container 100x120 crops 10px each side
  const celebrateStartIdx = 20;
  const scale = 120 / 180;
  const scaledFrameSize = 180 * scale; // 120
  const offsetX = (celebrateStartIdx + frame) * scaledFrameSize;
  // Center horizontally: crop (120-100)/2 = 10px from left
  const cropX = (scaledFrameSize - 100) / 2;

  return (
    <div
      className="shrink-0"
      role="img"
      aria-label={name}
      title={emoji}
      style={{
        width: 100,
        height: 120,
        backgroundImage: `url(/sprites/atlas/${id}.png)`,
        backgroundSize: `auto ${scaledFrameSize}px`,
        backgroundPosition: `${-(offsetX + cropX)}px 0px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated" as const,
      }}
    />
  );
}

export default function Dashboard() {
  const {
    metrics,
    memberStatuses: members,
    memberOs,
    memberProfiles,
    chatSummaries,
  } = useStatusStream();

  // Use Turso profiles if available, otherwise fallback
  const team = memberProfiles.length > 0
    ? memberProfiles.map(p => ({ id: p.id, name: p.nameCn || p.name, nameCn: p.nameCn, role: p.role, primaryColor: p.primaryColor }))
    : FALLBACK_TEAM;
  const [showAssetLib, setShowAssetLib] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const selectedChannel = chatSummaries.find((c) => c.channel_id === selectedChannelId);

  // --- Bug fix: browser back should close chat modal, not leave page ---
  const openChatRoom = useCallback((id: string) => {
    setSelectedChannelId(id);
    window.history.pushState({ chatRoom: id }, "");
  }, []);

  const closeChatRoom = useCallback(() => {
    setSelectedChannelId(null);
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      // If we had a chat room open and user pressed back, close it
      if (selectedChannelId) {
        setSelectedChannelId(null);
        // Don't let browser navigate away — the popstate already consumed the history entry
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [selectedChannelId]);

  const lastFetch = metrics?.updatedAt
    ? new Date(metrics.updatedAt).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei" })
    : "";


  const power = metrics && metrics.rateLimitPercent >= 0 ? 100 - metrics.rateLimitPercent : null;
  const powerColor = power === null ? "#999" : power > 60 ? "#22c55e" : power > 30 ? "#eab308" : "#ef4444";

  return (
    <div className="h-screen w-screen bg-gray-950 text-white font-mono flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 border-b border-gray-800 shrink-0">
        <h1 className="text-lg sm:text-xl font-bold tracking-wider">
          <span className="text-blue-400">Mind</span>
          <span className="text-orange-400">Fork</span>
          <span className="text-gray-500 ml-2 text-sm sm:text-base">Dashboard</span>
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAssetLib(true)}
            className="px-2 py-1 text-xs sm:text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700"
          >
            Asset Library
          </button>
          <span className="text-gray-600 text-xs sm:text-sm">{lastFetch || "--"}</span>
        </div>
      </div>

      {!metrics ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-lg">Connecting to Turso...</p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-auto lg:overflow-hidden">
          {/* LEFT: System */}
          <div className="w-full lg:w-[300px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-800 p-2 sm:p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="text-gray-500 text-xs sm:text-sm uppercase tracking-wider">System</div>

            {/* Power */}
            <div className="bg-gray-900 rounded-lg p-2 sm:p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm sm:text-base">POWER</span>
                <span className="text-xl sm:text-2xl font-bold" style={{ color: powerColor }}>
                  {power !== null ? `${power}%` : "--"}
                </span>
              </div>
              <div className="w-full h-3 bg-gray-950 rounded-full overflow-hidden">
                {power !== null && (
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${power}%`, background: powerColor }} />
                )}
              </div>
              <p className="text-gray-600 text-sm mt-1">5h Rate: {metrics.rateLimitPercent >= 0 ? `${metrics.rateLimitPercent}%` : "--"}</p>
            </div>

            {/* Tasks + Model */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-900 rounded-lg p-3">
                <span className="text-gray-400 text-sm">TASKS</span>
                <p className="text-2xl font-bold mt-1">{metrics.pendingTasks >= 0 ? metrics.pendingTasks : "--"}</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <span className="text-gray-400 text-sm">MODEL</span>
                <p className="text-sm text-cyan-400 mt-1">{shortModelName(metrics.modelName)}</p>
              </div>
            </div>

            {/* Cost + Context */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-900 rounded-lg p-3">
                <span className="text-gray-400 text-sm">COST</span>
                <p className="text-xl font-bold text-amber-400 mt-1">
                  {metrics.totalCostUsd !== undefined && metrics.totalCostUsd >= 0
                    ? `$${metrics.totalCostUsd.toFixed(2)}` : "--"}
                </p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <span className="text-gray-400 text-sm">CONTEXT</span>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-2.5 bg-gray-950 rounded-full overflow-hidden">
                    {metrics.contextUsedPercent !== undefined && metrics.contextUsedPercent >= 0 && (
                      <div className="h-full rounded-full" style={{
                        width: `${metrics.contextUsedPercent}%`,
                        background: metrics.contextUsedPercent > 80 ? "#ef4444" : metrics.contextUsedPercent > 50 ? "#eab308" : "#22c55e"
                      }} />
                    )}
                  </div>
                  <span className="text-base font-bold">
                    {metrics.contextUsedPercent !== undefined && metrics.contextUsedPercent >= 0
                      ? `${metrics.contextUsedPercent}%` : "--"}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-gray-700 text-sm text-center mt-1">
              DB: {metrics.updatedAt ? formatTW(metrics.updatedAt) : "--"}
            </p>

          </div>

          {/* RIGHT: Team */}
          <div className="flex-1 p-2 sm:p-4 overflow-y-auto">
            {/* Chat Card */}
            <DashboardChatCard
              summaries={chatSummaries}
              onSelectChannel={openChatRoom}
            />

            <div className="text-gray-500 text-xs sm:text-sm uppercase tracking-wider mb-3">Team Members</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {team.map(m => {
                const ms = members[m.id];
                const st = ms ? STATUS_MAP[ms.status] ?? { label: ms.status, color: "#6b7280" } : null;
                const os = memberOs[m.id];
                return (
                  <div key={m.id} className="bg-gray-700 border border-gray-600 rounded-lg p-2.5 overflow-hidden">
                    {/* Header: Avatar left + Name right */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <CelebrateAvatar id={m.id} name={m.name} emoji="" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm text-gray-400">{m.role}</p>
                        <p className="text-base sm:text-lg font-bold">{m.name}</p>
                      </div>
                    </div>
                    {/* Status */}
                    {st ? (
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: st.color }} />
                        <span className="text-sm" style={{ color: st.color }}>{st.label}</span>
                      </div>
                    ) : (
                      <span className="text-gray-600 text-sm">--</span>
                    )}
                    {/* Task */}
                    {ms?.task && (
                      <p className="text-gray-400 text-sm truncate">{ms.task}</p>
                    )}
                    {/* Inner OS — 列表顯示 */}
                    {os && os.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1 overflow-hidden">
                        {os.slice(0, 3).map((entry, i) => {
                          const timeStr = entry.at ? entry.at.replace(/^\d{4}-\d{2}-\d{2}\s*/, "") : "";
                          const taskStr = entry.task || "";
                          return (
                            <div key={i} className="text-xs sm:text-sm leading-snug break-words">
                              <span className="text-amber-400/80 italic">&ldquo;{entry.text}&rdquo;</span>
                              {(timeStr || taskStr) && (
                                <span className="text-gray-500 ml-1">
                                  &mdash; {timeStr}{taskStr ? ` ${taskStr}` : ""}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Chat Room Modal */}
      {selectedChannel && (
        <ChatRoomModal
          channel={selectedChannel}
          memberProfiles={memberProfiles}
          onClose={() => {
            // Pop the history entry we pushed when opening
            if (window.history.state?.chatRoom) {
              window.history.back();
            } else {
              closeChatRoom();
            }
          }}
        />
      )}

      {/* Asset Library Modal */}
      {showAssetLib && (
        <Suspense fallback={null}>
          <AssetLibraryModal onClose={() => setShowAssetLib(false)} />
        </Suspense>
      )}
    </div>
  );
}
