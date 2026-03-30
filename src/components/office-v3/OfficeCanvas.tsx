"use client";

import { useEffect, useRef } from "react";
import { OfficeEngine } from "./OfficeEngine";
import { CANVAS_W, CANVAS_H } from "./officeData";

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
}

export default function OfficeCanvas({ memberStatuses, memberOs, onCharacterClick, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OfficeEngine | null>(null);
  const clickRef = useRef(onCharacterClick);

  useEffect(() => { clickRef.current = onCharacterClick; }, [onCharacterClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new OfficeEngine(canvas, {
      onCharacterClick: (id) => clickRef.current?.(id),
    });

    let stopped = false;
    engine.init().then(() => {
      if (!stopped) { engine.start(); engineRef.current = engine; }
    });

    return () => { stopped = true; engine.stop(); engineRef.current = null; };
  }, []);

  useEffect(() => {
    if (memberStatuses && engineRef.current) engineRef.current.updateStatuses(memberStatuses);
  }, [memberStatuses]);

  useEffect(() => {
    if (memberOs && engineRef.current) engineRef.current.updateMemberOs(memberOs);
  }, [memberOs]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      className={className}
      style={{
        display: "block", width: "100%", height: "100%",
        objectFit: "contain", imageRendering: "pixelated", cursor: "pointer",
      }}
    />
  );
}
