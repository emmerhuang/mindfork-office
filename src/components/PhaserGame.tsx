"use client";

import { useEffect, useRef, useCallback } from "react";
import type * as PhaserTypes from "phaser";

interface PhaserGameProps {
  memberStatuses: Record<string, { status: string; task: string }>;
  onMemberClick: (memberId: string) => void;
}

export default function PhaserGame({ memberStatuses, onMemberClick }: PhaserGameProps) {
  const gameRef = useRef<PhaserTypes.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<import("./OfficeScene").OfficeScene | null>(null);

  const onMemberClickRef = useRef(onMemberClick);
  onMemberClickRef.current = onMemberClick;

  const memberStatusesRef = useRef(memberStatuses);
  memberStatusesRef.current = memberStatuses;

  const initGame = useCallback(async () => {
    if (!containerRef.current) return;
    if (gameRef.current) return; // already initialized

    const Phaser = await import("phaser");
    const { OfficeScene } = await import("./OfficeScene");

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 640,
      height: 480,
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      parent: containerRef.current,
      scene: [OfficeScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      backgroundColor: "#c4a87a",
    });

    gameRef.current = game;

    // Listen for member clicks from Phaser
    game.events.on("member-click", (memberId: string) => {
      onMemberClickRef.current(memberId);
    });

    // Get scene reference when ready
    game.events.once("ready", () => {
      const scene = game.scene.getScene("OfficeScene") as InstanceType<typeof OfficeScene>;
      if (scene) {
        sceneRef.current = scene;
        scene.updateStatuses(memberStatusesRef.current);
      }
    });

    // Fallback: try to get scene after a short delay
    setTimeout(() => {
      if (!sceneRef.current && game.scene) {
        const scene = game.scene.getScene("OfficeScene") as InstanceType<typeof OfficeScene> | null;
        if (scene) {
          sceneRef.current = scene;
          scene.updateStatuses(memberStatusesRef.current);
        }
      }
    }, 1000);
  }, []);

  useEffect(() => {
    initGame();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, [initGame]);

  // Push status updates to Phaser scene
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.updateStatuses(memberStatuses);
    }
  }, [memberStatuses]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        imageRendering: "pixelated",
      }}
    />
  );
}
