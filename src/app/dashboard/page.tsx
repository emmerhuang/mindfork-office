"use client";

import { useState, useEffect, useRef } from "react";

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

interface MemberStatus {
  status: string;
  task: string;
}

const TEAM = [
  { id: "boss", name: "老大", role: "總指揮", color: "#8B0000", emoji: "👔" },
  { id: "secretary", name: "秘書長", role: "協調與調度", color: "#1E3A5F", emoji: "📋" },
  { id: "sherlock", name: "Sherlock", role: "需求分析師", color: "#C0392B", emoji: "🔍" },
  { id: "lego", name: "Lego", role: "架構設計師", color: "#E87D20", emoji: "🏗️" },
  { id: "vault", name: "Vault", role: "資料庫設計師", color: "#2D5A3D", emoji: "🔐" },
  { id: "forge", name: "Forge", role: "實作工程師", color: "#6C3483", emoji: "🔨" },
  { id: "lens", name: "Lens", role: "測試工程師", color: "#2980B9", emoji: "🔬" },
  { id: "waffles", name: "Waffles", role: "柯基督察", color: "#F39C12", emoji: "🐕" },
  { id: "grant", name: "Grant", role: "GG審查專員", color: "#2C3E50", emoji: "📊" },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  idle: { label: "待命", color: "#6b7280" },
  working: { label: "工作中", color: "#22c55e" },
  meeting: { label: "開會中", color: "#3b82f6" },
  sleeping: { label: "休息中", color: "#a855f7" },
};

function CelebrateAvatar({ id, name, emoji }: { id: string; name: string; emoji: string }) {
  const [frame, setFrame] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setFrame(f => (f + 1) % 4);
    }, 200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <img
      src={`/sprites/v2/${id}/celebrate-south-${frame}.png`}
      alt={name}
      title={emoji}
      className="shrink-0"
      style={{
        imageRendering: "pixelated",
        clipPath: "inset(0 40px 0 40px)",
        marginLeft: -40,
        marginRight: -40,
      }}
    />
  );
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [members, setMembers] = useState<Record<string, MemberStatus>>({});
  const [memberOs, setMemberOs] = useState<Record<string, Array<{text: string; task?: string; at?: string}>>>({});
  const [lastFetch, setLastFetch] = useState("");

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          const data = await res.json();
          if (data.metrics) setMetrics(data.metrics);
          if (data.members) setMembers(data.members);
          if (data.memberOs) setMemberOs(data.memberOs);
          setLastFetch(new Date().toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei" }));
        }
      } catch { /* ignore */ }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, []);


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
        <span className="text-gray-600 text-xs sm:text-sm">{lastFetch || "--"}</span>
      </div>

      {!metrics ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-lg">Connecting to Turso...</p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-auto lg:overflow-hidden">
          {/* LEFT: System */}
          <div className="w-full lg:w-[300px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-800 p-2 sm:p-4 flex flex-col gap-3 overflow-visible lg:overflow-y-auto">
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
          <div className="flex-1 p-2 sm:p-4 overflow-visible lg:overflow-y-auto">
            <div className="text-gray-500 text-xs sm:text-sm uppercase tracking-wider mb-3">Team Members</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {TEAM.map(m => {
                const ms = members[m.id];
                const st = ms ? STATUS_MAP[ms.status] ?? { label: ms.status, color: "#6b7280" } : null;
                const os = memberOs[m.id];
                return (
                  <div key={m.id} className="bg-gray-700 border border-gray-600 rounded-lg p-2.5">
                    {/* Header: Avatar left + Name right */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <CelebrateAvatar id={m.id} name={m.name} emoji={m.emoji} />
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
                      <div className="mt-2 flex flex-col gap-1">
                        {os.slice(0, 3).map((entry, i) => {
                          const timeStr = entry.at ? entry.at.replace(/^\d{4}-\d{2}-\d{2}\s*/, "") : "";
                          const taskStr = entry.task || "";
                          return (
                            <div key={i} className="text-xs sm:text-sm leading-snug">
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
    </div>
  );
}
