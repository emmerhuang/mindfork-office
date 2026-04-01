"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { OfficeEngine } from "./OfficeEngine";
import { CANVAS_W, CANVAS_H } from "./officeData";
import { WAFFLES_ANIM_FRAMES, getWafflesFrame } from "./spriteAtlas";
import type { WafflesAnim } from "./spriteAtlas";

export interface OsEntry {
  text: string;
  task?: string;
  at?: string;
}

interface Props {
  memberStatuses?: Record<string, { status: string; task: string }>;
  memberOs?: Record<string, OsEntry[]>;
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

const WAFFLES_ANIM_TEXT: Record<WafflesAnim, string> = {
  bark: "汪汪汪！",
  idle: "（發呆中...）",
  running: "（興奮亂跑！）",
  sneaking: "（偷偷摸摸...嘿嘿）",
  walk: "（散步中～）",
};

const MEMBER_COLORS: Record<string, string> = {
  boss: "#8B0000", secretary: "#1e3a5f", sherlock: "#C0392B",
  lego: "#E87D20", vault: "#2D5A3D", forge: "#6C3483",
  lens: "#2980B9", waffles: "#F39C12",
};

// ── Component ──────────────────────────────────────────────

export default function OfficeCanvas({ memberStatuses, memberOs, onCharacterClick, className, metrics }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OfficeEngine | null>(null);
  const clickRef = useRef(onCharacterClick);
  const [showBulletin, setShowBulletin] = useState(false);
  const [showBossScreen, setShowBossScreen] = useState(false);
  const [wafflesZoom, setWafflesZoom] = useState<WafflesAnim | null>(null);
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoomRafRef = useRef<number | null>(null);
  const zoomImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => { clickRef.current = onCharacterClick; }, [onCharacterClick]);

  const handleBulletinClick = useCallback(() => setShowBulletin(true), []);
  const handleBossScreenClick = useCallback(() => setShowBossScreen(true), []);
  const handleWafflesZoom = useCallback((anim: WafflesAnim) => setWafflesZoom(anim), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new OfficeEngine(canvas, {
      onCharacterClick: (id) => clickRef.current?.(id),
      onBulletinClick: handleBulletinClick,
      onBossScreenClick: handleBossScreenClick,
      onWafflesZoom: handleWafflesZoom,
    });

    let stopped = false;
    engine.init().then(() => {
      if (!stopped) { engine.start(); engineRef.current = engine; }
    });

    return () => { stopped = true; engine.stop(); engineRef.current = null; };
  }, [handleBulletinClick, handleBossScreenClick, handleWafflesZoom]);

  useEffect(() => {
    if (memberStatuses && engineRef.current) engineRef.current.updateStatuses(memberStatuses);
  }, [memberStatuses]);

  useEffect(() => {
    if (memberOs && engineRef.current) engineRef.current.updateMemberOs(memberOs);
  }, [memberOs]);

  // Waffles zoom overlay animation
  useEffect(() => {
    if (!wafflesZoom) return;
    const zoomCanvas = zoomCanvasRef.current;
    if (!zoomCanvas) return;
    const ctx = zoomCanvas.getContext("2d");
    if (!ctx) return;

    // Load the sprite sheet for this animation
    const img = new Image();
    img.src = `/sprites/waffles-${wafflesZoom}.png`;
    zoomImgRef.current = img;

    const SCALE = 4;
    const FRAME_SIZE = 128;
    const DISPLAY_SIZE = FRAME_SIZE * SCALE; // 512px
    zoomCanvas.width = DISPLAY_SIZE;
    zoomCanvas.height = DISPLAY_SIZE;

    const framesPerDir = WAFFLES_ANIM_FRAMES[wafflesZoom];
    const totalFrames = framesPerDir;
    let frame = 0;
    let tickCount = 0;
    const TICKS_PER_FRAME = 8;
    let loops = 0;
    const MAX_LOOPS = 2;
    let stopped = false;

    const draw = () => {
      if (stopped) return;
      tickCount++;
      if (tickCount >= TICKS_PER_FRAME) {
        tickCount = 0;
        frame++;
        if (frame >= totalFrames) {
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
      if (img.complete) {
        // Use "south" direction (di=0)
        const f = getWafflesFrame(wafflesZoom, "south", frame);
        ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
      }
      zoomRafRef.current = requestAnimationFrame(draw);
    };

    img.onload = () => {
      zoomRafRef.current = requestAnimationFrame(draw);
    };
    // If already cached
    if (img.complete) {
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
          objectFit: "contain", imageRendering: "pixelated", cursor: "pointer",
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
                <div>
                  <span className="text-gray-500 text-xs block">Tasks</span>
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
            <button className="mt-4 w-full py-1.5 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700"
                    onClick={() => setShowBossScreen(false)}>
              關閉
            </button>
          </div>
        </div>
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
            {WAFFLES_ANIM_TEXT[wafflesZoom]}
          </p>
        </div>
      )}
    </div>
  );
}
