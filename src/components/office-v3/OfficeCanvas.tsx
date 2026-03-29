"use client";

// OfficeCanvas.tsx — React Component，管理 canvas ref 與引擎生命週期

import { useEffect, useRef, useCallback } from "react";
import { OfficeEngine } from "./OfficeEngine";
import { CANVAS_W, CANVAS_H } from "./officeData";

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface OfficeCanvasProps {
  memberStatuses?: Record<string, { status: string; task: string }>;
  onCharacterClick?: (charId: string) => void;
  onDialogue?: (charId: string, text: string) => void;
  className?: string;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export default function OfficeCanvas({
  memberStatuses,
  onCharacterClick,
  onDialogue,
  className,
}: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OfficeEngine | null>(null);

  // 穩定的回呼 ref（避免每次 re-render 重新綁定）
  const onCharacterClickRef = useRef(onCharacterClick);
  const onDialogueRef = useRef(onDialogue);

  useEffect(() => {
    onCharacterClickRef.current = onCharacterClick;
  }, [onCharacterClick]);

  useEffect(() => {
    onDialogueRef.current = onDialogue;
  }, [onDialogue]);

  // 引擎啟動
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new OfficeEngine(canvas, {
      onCharacterClick: (charId) => onCharacterClickRef.current?.(charId),
      onDialogue: (charId, text) => onDialogueRef.current?.(charId, text),
    });

    engine.init();
    engine.start();
    engineRef.current = engine;

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  // 外部狀態更新（memberStatuses 變動時通知引擎）
  useEffect(() => {
    if (memberStatuses && engineRef.current) {
      engineRef.current.updateStatuses(memberStatuses);
    }
  }, [memberStatuses]);

  // 讓 canvas 在容器內等比縮放，但邏輯解析度固定 960x640
  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      className={className}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        imageRendering: "pixelated", // 像素風縮放不模糊
        cursor: "pointer",
      }}
    />
  );
}
