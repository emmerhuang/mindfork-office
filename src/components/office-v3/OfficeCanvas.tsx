"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { OfficeEngine } from "./OfficeEngine";
import type { ConvBarData } from "./OfficeEngine";
import { CANVAS_W, CANVAS_H } from "./officeData";
import type { AtlasFrame } from "./spriteAtlas";
const WAFFLES_ZOOM_TEXT: Record<WafflesAnim, string> = {
  bark: "汪汪汪！",
  idle: "（發呆中...）",
  running: "（興奮亂跑！）",
  sneaking: "（偷偷摸摸...嘿嘿）",
  walk: "（散步中～）",
};
import type { WafflesAnim } from "./spriteAtlas";
import { ChatOverlay } from "@/components/chat/ChatOverlay";
import type { ChatChannelSummary } from "@/types";
import LayoutEditorOverlay from "./LayoutEditorOverlay";
import type { LayoutEditorHandle } from "./LayoutEditorOverlay";
import type { OfficeLayout } from "./LayoutManager";

export interface OsEntry {
  text: string;
  task?: string;
  at?: string;
}

export interface TaskQueueItem {
  id: number;
  task: string;
  status: string;
  assigned_to?: string;
  received_at?: string;
  note?: string;
}

interface Props {
  memberStatuses?: Record<string, { status: string; task: string }>;
  memberOs?: Record<string, OsEntry[]>;
  taskQueue?: TaskQueueItem[];
  meetingActive?: boolean;
  chatSummaries?: ChatChannelSummary[];
  onCharacterClick?: (charId: string) => void;
  className?: string;
  metrics?: {
    rateLimitPercent: number;
    pendingTasks: number;
    totalCostUsd?: number;
    modelName?: string;
    contextUsedPercent?: number;
  };
}


const MEMBER_COLORS: Record<string, string> = {
  boss: "#8B0000", secretary: "#1e3a5f", sherlock: "#C0392B",
  lego: "#E87D20", vault: "#2D5A3D", forge: "#6C3483",
  lens: "#2980B9", waffles: "#F39C12",
};

// ── Conversation Bar defaults ──────────────────────────────
const CONV_PORTRAIT_RENDER  = 180;  // original sprite size (fixed)
const CONV_DEFAULTS = { colW: 80, barH: 80, portraitW: 120, portraitScale: 100, portraitBottom: 40, portraitXL: 0, portraitXR: 0, portraitY: 0 };
const CONV_LS_KEY = "mindfork-conv-bar-settings";

function loadConvSettings() {
  try {
    const raw = localStorage.getItem(CONV_LS_KEY);
    if (raw) return { ...CONV_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...CONV_DEFAULTS };
}

// ── Component ──────────────────────────────────────────────

export default function OfficeCanvas({ memberStatuses, memberOs, taskQueue, meetingActive, chatSummaries, onCharacterClick, className, metrics }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OfficeEngine | null>(null);
  const clickRef = useRef(onCharacterClick);
  const [showBulletin, setShowBulletin] = useState(false);
  const [showBossScreen, setShowBossScreen] = useState(false);
  const [showChatroom, setShowChatroom] = useState(false);
  const [showTaskList, setShowTaskList] = useState(false);
  const [wafflesZoom, setWafflesZoom] = useState<{ dir: string; anim: WafflesAnim } | null>(null);
  const [convBar, setConvBar] = useState<ConvBarData | null>(null);
  const [convEdit, setConvEdit] = useState(false); // conversation bar edit mode
  const [convPwPrompt, setConvPwPrompt] = useState(false);
  const [convPw, setConvPw] = useState("");
  const [conv, setConv] = useState(CONV_DEFAULTS);
  // Load saved settings: server first, localStorage fallback
  useEffect(() => {
    let cancelled = false;
    fetch("/api/conv-settings")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && Object.keys(data).length > 0) {
          const merged = { ...CONV_DEFAULTS, ...data };
          setConv(merged);
          // Cache to localStorage
          localStorage.setItem(CONV_LS_KEY, JSON.stringify(merged));
        } else {
          // Fallback to localStorage
          setConv(loadConvSettings());
        }
      })
      .catch(() => {
        if (!cancelled) setConv(loadConvSettings());
      });
    return () => { cancelled = true; };
  }, []);
  // Track canvas rendered area (object-fit: contain leaves gaps on wide screens)
  const [canvasRect, setCanvasRect] = useState<{ left: number; width: number; bottomGap: number } | null>(null);
  const [editorMode, setEditorMode] = useState(false);
  const editorRef = useRef<LayoutEditorHandle>(null);
  const preEditLayoutRef = useRef<OfficeLayout | null>(null);
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoomRafRef = useRef<number | null>(null);
  const zoomImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => { clickRef.current = onCharacterClick; }, [onCharacterClick]);

  // Track the canvas's actual rendered area (object-fit: contain)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const compute = () => {
      const r = canvas.getBoundingClientRect();
      const parent = canvas.parentElement?.getBoundingClientRect();
      if (!parent) return;
      const canvasAspect = CANVAS_W / CANVAS_H;
      const boxAspect = r.width / r.height;
      let renderW: number, renderH: number, offsetX: number;
      if (boxAspect > canvasAspect) {
        // pillarboxed: canvas image narrower than element
        renderH = r.height;
        renderW = r.height * canvasAspect;
        offsetX = (r.width - renderW) / 2;
      } else {
        renderW = r.width;
        renderH = r.width / canvasAspect;
        offsetX = 0;
      }
      // objectPosition: top → image starts at top, gap is at bottom
      const bottomGap = r.height - renderH;
      // Convert to parent-relative coordinates
      const left = r.left - parent.left + offsetX;
      setCanvasRect({ left, width: renderW, bottomGap });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Refs to always-current prop values, so engine init can grab them after async resolve
  const memberStatusesRef = useRef(memberStatuses);
  const memberOsRef = useRef(memberOs);
  useEffect(() => { memberStatusesRef.current = memberStatuses; }, [memberStatuses]);
  useEffect(() => { memberOsRef.current = memberOs; }, [memberOs]);

  const handleBulletinClick = useCallback(() => setShowBulletin(true), []);
  const handleBossScreenClick = useCallback(() => setShowBossScreen(true), []);
  const handleChatroomClick = useCallback(() => setShowChatroom(true), []);
  const handleWafflesZoom = useCallback((anim: WafflesAnim, dir?: string) => setWafflesZoom({ anim, dir: dir ?? "south" }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new OfficeEngine(canvas, {
      onCharacterClick: (id) => clickRef.current?.(id),
      onBulletinClick: handleBulletinClick,
      onBossScreenClick: handleBossScreenClick,
      onChatroomClick: handleChatroomClick,
      onWafflesZoom: handleWafflesZoom,
      onConversationBar: (data) => setConvBar(data),
    });

    let stopped = false;
    engine.init().then(() => {
      if (!stopped) {
        engine.start();
        engineRef.current = engine;
        // Push any data that arrived before engine was ready
        if (memberStatusesRef.current) engine.updateStatuses(memberStatusesRef.current);
        if (memberOsRef.current) engine.updateMemberOs(memberOsRef.current);
      }
    });

    return () => { stopped = true; engine.stop(); engineRef.current = null; };
  }, [handleBulletinClick, handleBossScreenClick, handleChatroomClick, handleWafflesZoom]);

  useEffect(() => {
    if (memberStatuses && engineRef.current) engineRef.current.updateStatuses(memberStatuses);
  }, [memberStatuses]);

  useEffect(() => {
    if (memberOs && engineRef.current) engineRef.current.updateMemberOs(memberOs);
  }, [memberOs]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMeeting(!!meetingActive);
    }
  }, [meetingActive]);

  // Waffles zoom overlay animation — atlas-based excited frames
  useEffect(() => {
    if (!wafflesZoom) return;
    const zoomCanvas = zoomCanvasRef.current;
    if (!zoomCanvas) return;
    const ctx = zoomCanvas.getContext("2d");
    if (!ctx) return;

    const TOTAL_FRAMES = 4;
    const dir = wafflesZoom.dir;

    const SCALE = 4;
    const FRAME_SIZE = 180; // v2 sprites are 180x180
    const DISPLAY_SIZE = FRAME_SIZE * SCALE; // 720px
    zoomCanvas.width = DISPLAY_SIZE;
    zoomCanvas.height = DISPLAY_SIZE;

    let stopped = false;
    let frame = 0;
    let tickCount = 0;
    const TICKS_PER_FRAME = 6;
    let loops = 0;
    const MAX_LOOPS = 3;

    // Load atlas image + JSON metadata
    const atlasImg = new Image();
    let atlasFrames: Record<string, AtlasFrame> = {};

    const draw = () => {
      if (stopped) return;
      tickCount++;
      if (tickCount >= TICKS_PER_FRAME) {
        tickCount = 0;
        frame++;
        if (frame >= TOTAL_FRAMES) {
          loops++;
          if (loops >= MAX_LOOPS) {
            setWafflesZoom(null);
            return;
          }
          frame = 0;
        }
      }
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
      const frameKey = `v2-waffles-excited-${dir}-${frame}`;
      const af = atlasFrames[frameKey];
      if (atlasImg.complete && af) {
        ctx.drawImage(atlasImg, af.x, af.y, af.w, af.h, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
      }
      zoomRafRef.current = requestAnimationFrame(draw);
    };

    let ready = 0;
    const tryStart = () => {
      ready++;
      if (ready === 2 && !stopped) {
        zoomRafRef.current = requestAnimationFrame(draw);
      }
    };

    atlasImg.src = "/sprites/atlas/waffles.png";
    atlasImg.onload = tryStart;
    if (atlasImg.complete) { ready++; }

    fetch("/sprites/atlas/waffles.json")
      .then((r) => r.json())
      .then((meta: { frames: Record<string, AtlasFrame> }) => {
        atlasFrames = meta.frames;
        tryStart();
      });

    if (ready === 2) {
      zoomRafRef.current = requestAnimationFrame(draw);
    }

    return () => {
      stopped = true;
      if (zoomRafRef.current !== null) cancelAnimationFrame(zoomRafRef.current);
    };
  }, [wafflesZoom]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          display: "block", width: "100%", height: "100%",
          objectFit: "contain", objectPosition: "top", imageRendering: "pixelated", cursor: "pointer",
        }}
      />

      {/* Whiteboard: 已完成專案 */}
      {showBulletin && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10"
             onClick={() => setShowBulletin(false)}>
          <div className="bg-gray-900 border border-cyan-500 rounded-lg p-5 max-w-sm w-full mx-4"
               onClick={(e) => e.stopPropagation()}
               style={{ imageRendering: "auto" }}>
            <h2 className="text-lg font-bold text-cyan-400 mb-3 text-center font-mono tracking-wider">
              HALL OF FAME
            </h2>
            <ul className="space-y-1.5 text-sm text-gray-300">
              <li>• rotarysso — 扶輪 SSO 單一登入</li>
              <li>• rotaryCredit — 信用稽核預警系統</li>
              <li>• account-rotary — 扶輪會計系統</li>
              <li>• WaHoot — 互動問答系統</li>
              <li>• MindFork Office — 團隊辦公室</li>
            </ul>
            <button className="mt-4 w-full py-1.5 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700"
                    onClick={() => setShowBulletin(false)}>
              關閉
            </button>
          </div>
        </div>
      )}

      {/* Boss Screen: Dashboard Overlay */}
      {showBossScreen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10"
             onClick={() => setShowBossScreen(false)}>
          <div className="bg-gray-900 border border-cyan-500 rounded-lg p-5 max-w-md w-full mx-4"
               onClick={(e) => e.stopPropagation()}
               style={{ imageRendering: "auto" }}>
            <h2 className="text-lg font-bold text-cyan-400 mb-4 font-mono tracking-wider text-center">
              DASHBOARD
            </h2>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Power</span>
                <div className="flex items-center gap-2 flex-1 mx-3">
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.max(0, 100 - (metrics?.rateLimitPercent ?? 0))}%`,
                      background: (metrics?.rateLimitPercent ?? 0) < 50 ? "#22c55e" : (metrics?.rateLimitPercent ?? 0) < 80 ? "#eab308" : "#ef4444"
                    }} />
                  </div>
                </div>
                <span className="font-bold" style={{
                  color: (metrics?.rateLimitPercent ?? 0) < 50 ? "#22c55e" : (metrics?.rateLimitPercent ?? 0) < 80 ? "#eab308" : "#ef4444"
                }}>{metrics?.rateLimitPercent !== undefined ? `${100 - metrics?.rateLimitPercent}%` : "--"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Context</span>
                <div className="flex items-center gap-2 flex-1 mx-3">
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${metrics?.contextUsedPercent ?? 0}%`,
                      background: (metrics?.contextUsedPercent ?? 0) > 80 ? "#ef4444" : (metrics?.contextUsedPercent ?? 0) > 50 ? "#eab308" : "#22c55e"
                    }} />
                  </div>
                </div>
                <span className="text-white font-bold">{metrics?.contextUsedPercent !== undefined ? `${metrics?.contextUsedPercent}%` : "--"}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div
                  className="cursor-pointer hover:bg-gray-800 rounded-lg transition-colors"
                  onClick={() => setShowTaskList(prev => !prev)}
                >
                  <span className="text-gray-500 text-xs block">Tasks {showTaskList ? "▲" : "▼"}</span>
                  <span className="text-white text-xl font-bold">{metrics?.pendingTasks ?? "--"}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs block">Model</span>
                  <span className="text-cyan-400 text-sm">{metrics?.modelName ? (metrics?.modelName.match(/(Opus|Sonnet|Haiku)\s*[\d.]+/i)?.[0] ?? metrics?.modelName) : "--"}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs block">Cost</span>
                  <span className="text-amber-400 font-bold">{metrics?.totalCostUsd !== undefined ? `$${metrics?.totalCostUsd.toFixed(0)}` : "--"}</span>
                </div>
              </div>
              {/* Task Queue Detail */}
              {showTaskList && (
                <div className="border border-gray-700 rounded-lg p-2 max-h-40 overflow-y-auto">
                  {taskQueue && taskQueue.length > 0 ? (
                    <div className="space-y-1.5">
                      {taskQueue.map(t => (
                        <div key={t.id} className="flex items-start gap-2 text-xs">
                          <span className="text-gray-500 shrink-0">#{t.id}</span>
                          <span className="text-gray-200 flex-1 break-all">{t.task}</span>
                          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                            t.status === "pending" ? "bg-yellow-900 text-yellow-300" :
                            t.status === "in_progress" ? "bg-blue-900 text-blue-300" :
                            "bg-gray-800 text-gray-400"
                          }`}>{t.status}</span>
                          {t.assigned_to && (
                            <span className="text-gray-500 shrink-0">{t.assigned_to}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-xs text-center">No pending tasks</p>
                  )}
                </div>
              )}
              <div className="border-t border-gray-700 pt-2">
                <span className="text-gray-500 text-xs">Team</span>
                <div className="grid grid-cols-4 gap-1 mt-1">
                  {memberStatuses && Object.entries(memberStatuses).map(([id, s]) => (
                    <div key={id} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{
                        background: s.status === "working" ? "#22c55e" : s.status === "meeting" ? "#3b82f6" : "#6b7280"
                      }} />
                      <span className="text-gray-300 text-[10px]">{id}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="flex-1 py-1.5 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700"
                      onClick={() => setShowBossScreen(false)}>
                關閉
              </button>
              <button className="py-1.5 px-3 bg-amber-800 text-amber-200 rounded text-xs hover:bg-amber-700"
                      onClick={() => {
                        setShowBossScreen(false);
                        editorRef.current?.triggerPasswordPrompt();
                      }}>
                裝修
              </button>
              <button className="py-1.5 px-3 bg-cyan-800 text-cyan-200 rounded text-xs hover:bg-cyan-700"
                      onClick={() => {
                        setShowBossScreen(false);
                        setConvPwPrompt(true);
                        setConvPw("");
                      }}>
                對話Bar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Conv Bar password prompt — same style as 裝修 */}
      {convPwPrompt && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
          <div className="bg-gray-900 border border-cyan-500 rounded-lg p-4 w-64" style={{ imageRendering: "auto" }}>
            <p className="text-gray-300 text-sm mb-2 font-mono">Enter password:</p>
            <input
              type="password"
              value={convPw}
              onChange={(e) => setConvPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (convPw === "emmer99") { setConvPwPrompt(false); setConvPw(""); setConvEdit(true); }
                  else { setConvPw(""); }
                }
              }}
              className="w-full bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-cyan-400"
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  if (convPw === "emmer99") { setConvPwPrompt(false); setConvPw(""); setConvEdit(true); }
                  else { setConvPw(""); }
                }}
                className="flex-1 py-1 bg-cyan-600 text-white rounded text-xs hover:bg-cyan-500"
              >Enter</button>
              <button
                onClick={() => { setConvPwPrompt(false); setConvPw(""); }}
                className="flex-1 py-1 bg-gray-700 text-gray-300 rounded text-xs hover:bg-gray-600"
              >Exit</button>
            </div>
          </div>
        </div>
      )}

      {/* Layout Editor Overlay — always rendered for secret button; layout may be null before engine init */}
      <LayoutEditorOverlay
        ref={editorRef}
        layout={engineRef.current?.layout ?? { version: 1, floors: { work: { color: "#D4CFC8" }, tearoom: { color: "#E8DFC8" }, meetingRoom: { color: "#D8D0E0" } }, objects: [] }}
        canvasRef={canvasRef}
        onSave={(updated: OfficeLayout) => {
          if (engineRef.current) {
            engineRef.current.layout = updated;
            engineRef.current.editorMode = false;
            engineRef.current.rerender();
          }
          preEditLayoutRef.current = null;
          setEditorMode(false);
        }}
        onCancel={() => {
          if (engineRef.current && preEditLayoutRef.current) {
            engineRef.current.layout = preEditLayoutRef.current;
            engineRef.current.editorMode = false;
            engineRef.current.rerender();
            preEditLayoutRef.current = null;
          } else if (engineRef.current) {
            engineRef.current.editorMode = false;
          }
          setEditorMode(false);
        }}
        onPreview={(objects, floors) => {
          if (engineRef.current && engineRef.current.layout) {
            if (!preEditLayoutRef.current) {
              preEditLayoutRef.current = JSON.parse(JSON.stringify(engineRef.current.layout));
              // First time entering editor mode: send all characters home
              engineRef.current.resetCharactersToHome();
            }
            engineRef.current.editorMode = true;
            engineRef.current.layout = {
              ...engineRef.current.layout,
              objects,
              ...(floors ? { floors } : {}),
            };
            engineRef.current.rerender();
          }
        }}
      />

      {/* Conversation Bar Overlay — flex 三欄 */}
      {(convBar || convEdit) && (() => {
        const portraitW = conv.portraitW;
        const scale = (conv.portraitScale ?? 100) / 100;
        const imgSize = CONV_PORTRAIT_RENDER * scale;
        const portraitCrop = (imgSize - portraitW) / 2;
        const containerH = conv.barH + (imgSize - conv.portraitBottom);
        const showDebug = convEdit;
        // Preview data when editing without active conversation
        const bar = convBar ?? {
          charAId: "mika", charBId: "lens",
          charAName: "Mika", charBName: "Lens",
          charARole: "", charBRole: "",
          charAColor: "#E91E63", charBColor: "#2980B9",
          speaker: "A" as const, text: "這是預覽對話文字，用來調整版面配置。",
        };
        return (
        <div style={{
          position: "absolute",
          bottom: (canvasRect ? canvasRect.bottomGap : 0) + 20,
          left: canvasRect ? canvasRect.left : 0,
          width: canvasRect ? canvasRect.width : "100%",
          height: containerH,
          zIndex: 15, pointerEvents: convEdit ? "auto" : "none",
          imageRendering: "auto",
        }}>
          {/* Bar row: flex layout */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: conv.barH,
            background: "rgba(10,10,20,0.88)",
            backdropFilter: "blur(4px)",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            display: "flex", flexDirection: "row",
            overflow: "visible",
            ...(showDebug ? { outline: "2px solid red" } : {}),
          }}>
            {/* Left column */}
            <div style={{ width: conv.colW, flexShrink: 0, position: "relative", overflow: "visible", ...(showDebug ? { outline: "2px solid lime" } : {}) }}>
              <div style={{
                position: "absolute",
                bottom: conv.portraitBottom + conv.portraitY,
                left: (conv.colW - portraitW) / 2 + conv.portraitXL,
                width: portraitW,
                height: imgSize,
                overflow: "hidden",
                ...(showDebug ? { outline: "1px dashed cyan" } : {}),
              }}>
                <div
                  role="img"
                  aria-label={bar.charAName}
                  style={{
                    width: imgSize,
                    height: imgSize,
                    maxWidth: "none",
                    marginLeft: -portraitCrop,
                    backgroundImage: `url(/sprites/atlas/${bar.charAId}.png)`,
                    backgroundSize: `auto ${imgSize}px`,
                    backgroundPosition: "0px 0px",
                    backgroundRepeat: "no-repeat",
                    imageRendering: "pixelated",
                    opacity: bar.speaker === "A" ? 1 : 0.4,
                    filter: bar.speaker === "A" ? `drop-shadow(0 0 10px ${bar.charAColor})` : "none",
                    transition: "opacity 0.3s, filter 0.3s",
                  }}
                />
              </div>
              <div style={{ position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center" }}>
                <span style={{ color: "#fff", fontSize: 11, fontWeight: "bold" }}>{bar.charAName}</span>
              </div>
            </div>

            {/* Center: dialogue text */}
            <div style={{
              flex: 1, minWidth: 0,
              display: "flex", alignItems: "center",
              justifyContent: bar.speaker === "A" ? "flex-start" : "flex-end",
              textAlign: bar.speaker === "A" ? "left" : "right",
              color: "#fff", fontSize: 13, lineHeight: 1.6,
              padding: "0 12px",
              ...(showDebug ? { outline: "2px solid magenta" } : {}),
            }}>
              <span>{bar.text}</span>
            </div>

            {/* Right column */}
            <div style={{ width: conv.colW, flexShrink: 0, position: "relative", overflow: "visible", ...(showDebug ? { outline: "2px solid lime" } : {}) }}>
              <div style={{
                position: "absolute",
                bottom: conv.portraitBottom + conv.portraitY,
                left: (conv.colW - portraitW) / 2 + conv.portraitXR,
                width: portraitW,
                height: imgSize,
                overflow: "hidden",
                ...(showDebug ? { outline: "1px dashed cyan" } : {}),
              }}>
                <div
                  role="img"
                  aria-label={bar.charBName}
                  style={{
                    width: imgSize,
                    height: imgSize,
                    maxWidth: "none",
                    marginLeft: -portraitCrop,
                    backgroundImage: `url(/sprites/atlas/${bar.charBId}.png)`,
                    backgroundSize: `auto ${imgSize}px`,
                    backgroundPosition: "0px 0px",
                    backgroundRepeat: "no-repeat",
                    imageRendering: "pixelated",
                    opacity: bar.speaker === "B" ? 1 : 0.4,
                    filter: bar.speaker === "B" ? `drop-shadow(0 0 10px ${bar.charBColor})` : "none",
                    transition: "opacity 0.3s, filter 0.3s",
                  }}
                />
              </div>
              <div style={{ position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center" }}>
                <span style={{ color: "#fff", fontSize: 11, fontWeight: "bold" }}>{bar.charBName}</span>
              </div>
            </div>
          </div>

          {/* Edit panel */}
          {convEdit && (
            <div style={{
              position: "absolute", top: -160, right: 0,
              background: "rgba(0,0,0,0.9)", borderRadius: 8, padding: "10px 14px",
              color: "#fff", fontSize: 12, pointerEvents: "auto", zIndex: 20,
              display: "flex", flexDirection: "column", gap: 6, minWidth: 220,
            }}>
              <div style={{ fontWeight: "bold", marginBottom: 2 }}>對話 Bar 調整</div>
              {([
                ["欄寬 (對稱)", "colW", 40, 160],
                ["Bar 高度", "barH", 40, 160],
                ["人像寬度", "portraitW", 60, 180],
                ["人像縮放%", "portraitScale", 50, 200],
                ["人像底距", "portraitBottom", -60, 120],
                ["左人像X", "portraitXL", -80, 80],
                ["右人像X", "portraitXR", -80, 80],
                ["人像Y", "portraitY", -60, 60],
              ] as const).map(([label, key, min, max]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 80, flexShrink: 0 }}>{label}</span>
                  <input type="range" min={min} max={max} value={conv[key]}
                    style={{ flex: 1 }}
                    onChange={(e) => setConv((p) => ({ ...p, [key]: Number(e.target.value) }))}
                  />
                  <span style={{ width: 30, textAlign: "right" }}>{conv[key]}</span>
                </label>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button style={{ flex: 1, padding: "4px 0", background: "#22c55e", color: "#000", borderRadius: 4, border: "none", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => {
                    fetch("/api/conv-settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ password: "emmer99", settings: conv }),
                    })
                      .then((r) => {
                        if (!r.ok) throw new Error("save failed");
                        // Also cache locally
                        localStorage.setItem(CONV_LS_KEY, JSON.stringify(conv));
                        setConvEdit(false);
                      })
                      .catch(() => {
                        alert("儲存失敗，請重試");
                      });
                  }}>儲存</button>
                <button style={{ flex: 1, padding: "4px 0", background: "#555", color: "#fff", borderRadius: 4, border: "none", cursor: "pointer" }}
                  onClick={() => {
                    setConv(CONV_DEFAULTS);
                    localStorage.removeItem(CONV_LS_KEY);
                  }}>重置</button>
                <button style={{ flex: 1, padding: "4px 0", background: "#333", color: "#fff", borderRadius: 4, border: "none", cursor: "pointer" }}
                  onClick={() => setConvEdit(false)}>關閉</button>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* Chatroom Overlay */}
      {showChatroom && (
        <ChatOverlay
          summaries={chatSummaries ?? []}
          onClose={() => setShowChatroom(false)}
        />
      )}

      {/* Waffles Zoom Overlay */}
      {wafflesZoom && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10"
             onClick={() => setWafflesZoom(null)}
             style={{ imageRendering: "pixelated" }}>
          <canvas
            ref={zoomCanvasRef}
            style={{ width: 512, height: 512, imageRendering: "pixelated" }}
          />
          <p className="mt-3 text-white text-2xl font-bold"
             style={{ imageRendering: "auto", textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
            {wafflesZoom ? WAFFLES_ZOOM_TEXT[wafflesZoom.anim] : ""}
          </p>
        </div>
      )}
    </div>
  );
}
