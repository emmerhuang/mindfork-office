"use client";

// LayoutEditorOverlay.tsx — Visual drag-and-drop layout editor
// Overlays on top of the canvas. Coordinates are converted from DOM to canvas space.

import { useState, useRef, useCallback, useEffect } from "react";
import { TILE, CANVAS_W, CANVAS_H, COLS, ROWS } from "./officeData";
import { saveLayout, exportLayout } from "./LayoutManager";
import { MAP_OBJ_NAMES, getMapObj } from "./TileRenderer";
import type { OfficeLayout, LayoutObject } from "./LayoutManager";

// ── Sprite palette categories ────────────────────────────────

interface SpriteInfo {
  name: string;
  category: string;
  defaultW: number;
  defaultH: number;
}

const PALETTE_SPRITES: SpriteInfo[] = [
  // Walls
  { name: "wall-bookshelf", category: "wall", defaultW: 128, defaultH: 192 },
  { name: "wall-window", category: "wall", defaultW: 128, defaultH: 192 },
  { name: "wall-whiteboard", category: "wall", defaultW: 256, defaultH: 192 },
  { name: "wall-clock", category: "wall", defaultW: 64, defaultH: 64 },
  // Desks
  { name: "desk-monitor", category: "desk", defaultW: 192, defaultH: 96 },
  { name: "desk-laptop", category: "desk", defaultW: 192, defaultH: 96 },
  { name: "dog-bed", category: "desk", defaultW: 192, defaultH: 96 },
  // Tearoom
  { name: "fridge", category: "tearoom", defaultW: 80, defaultH: 120 },
  { name: "water-cooler", category: "tearoom", defaultW: 80, defaultH: 120 },
  { name: "coffee-machine", category: "tearoom", defaultW: 52, defaultH: 72 },
  { name: "kitchen-counter", category: "tearoom", defaultW: 128, defaultH: 64 },
  { name: "cafe-table", category: "tearoom", defaultW: 128, defaultH: 108 },
  { name: "vending-machine", category: "tearoom", defaultW: 120, defaultH: 120 },
  { name: "trash-can", category: "tearoom", defaultW: 44, defaultH: 52 },
  { name: "bar-table", category: "tearoom", defaultW: 96, defaultH: 140 },
  // Meeting
  { name: "conference-table", category: "meeting", defaultW: 200, defaultH: 200 },
  { name: "projector-screen", category: "meeting", defaultW: 230, defaultH: 148 },
  // Decoration
  { name: "floor-blue", category: "decoration", defaultW: 64, defaultH: 64 },
  { name: "floor-wood", category: "decoration", defaultW: 64, defaultH: 64 },
  { name: "floor-purple", category: "decoration", defaultW: 64, defaultH: 64 },
];

const CATEGORIES = [
  { key: "wall", label: "Wall" },
  { key: "desk", label: "Desk" },
  { key: "tearoom", label: "Tearoom" },
  { key: "meeting", label: "Meeting" },
  { key: "decoration", label: "Decoration" },
];

const PASSWORD = "millet99";

// ── Helpers ──────────────────────────────────────────────────

let idCounter = Date.now();
function genId(): string {
  return `obj-${idCounter++}`;
}

function snapToGrid(v: number): number {
  return Math.round(v);  // 1px precision
}
function snapToTile(v: number): number {
  return Math.round(v / TILE) * TILE;  // tile-aligned (for new objects)
}

// ── Component ────────────────────────────────────────────────

interface Props {
  layout: OfficeLayout;
  onSave: (layout: OfficeLayout) => void;
  onCancel: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

type Tool = "select" | "delete";

export default function LayoutEditorOverlay({ layout, onSave, onCancel, canvasRef }: Props) {
  const [editing, setEditing] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState("");
  const [objects, setObjects] = useState<LayoutObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [dragState, setDragState] = useState<{
    type: "move" | "resize";
    startX: number;
    startY: number;
    objStartX: number;
    objStartY: number;
    objStartW: number;
    objStartH: number;
    corner?: string;
  } | null>(null);
  const [dropPreview, setDropPreview] = useState<{ sprite: string; x: number; y: number; w: number; h: number } | null>(null);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragSpriteRef = useRef<SpriteInfo | null>(null);

  // Enter edit mode
  const handleSecretClick = useCallback(() => {
    setShowPasswordPrompt(true);
  }, []);

  const handlePasswordSubmit = useCallback(() => {
    if (password === PASSWORD) {
      setObjects(JSON.parse(JSON.stringify(layout.objects)));
      setEditing(true);
      setShowPasswordPrompt(false);
      setPassword("");
    } else {
      setPassword("");
    }
  }, [password, layout.objects]);

  // Convert DOM event coords to canvas coords
  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number): { cx: number; cy: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      const canvasAspect = CANVAS_W / CANVAS_H;
      const boxAspect = r.width / r.height;
      let renderW: number, renderH: number, offsetX: number, offsetY: number;
      if (boxAspect > canvasAspect) {
        renderH = r.height;
        renderW = r.height * canvasAspect;
        offsetX = (r.width - renderW) / 2;
        offsetY = 0;
      } else {
        renderW = r.width;
        renderH = r.width / canvasAspect;
        offsetX = 0;
        offsetY = 0; // objectPosition: top
      }
      const cx = ((clientX - r.left - offsetX) / renderW) * CANVAS_W;
      const cy = ((clientY - r.top - offsetY) / renderH) * CANVAS_H;
      return { cx, cy };
    },
    [canvasRef],
  );

  // Convert canvas coords to DOM (overlay) coords
  const fromCanvasCoords = useCallback(
    (cx: number, cy: number): { dx: number; dy: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      const canvasAspect = CANVAS_W / CANVAS_H;
      const boxAspect = r.width / r.height;
      let renderW: number, renderH: number, offsetX: number, offsetY: number;
      if (boxAspect > canvasAspect) {
        renderH = r.height;
        renderW = r.height * canvasAspect;
        offsetX = (r.width - renderW) / 2;
        offsetY = 0;
      } else {
        renderW = r.width;
        renderH = r.width / canvasAspect;
        offsetX = 0;
        offsetY = 0;
      }
      const dx = (cx / CANVAS_W) * renderW + offsetX + r.left;
      const dy = (cy / CANVAS_H) * renderH + offsetY + r.top;
      return { dx, dy };
    },
    [canvasRef],
  );

  // Get scale factor: DOM pixels per canvas pixel
  const getScale = useCallback((): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    const r = canvas.getBoundingClientRect();
    const canvasAspect = CANVAS_W / CANVAS_H;
    const boxAspect = r.width / r.height;
    if (boxAspect > canvasAspect) {
      return r.height / CANVAS_H;
    } else {
      return r.width / CANVAS_W;
    }
  }, [canvasRef]);

  // Find object at canvas coords
  const findObjectAt = useCallback(
    (cx: number, cy: number): LayoutObject | null => {
      // Reverse order so top-drawn objects are hit first
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (cx >= obj.x && cx <= obj.x + obj.width && cy >= obj.y && cy <= obj.y + obj.height) {
          return obj;
        }
      }
      return null;
    },
    [objects],
  );

  // Check if near a corner (for resize)
  const getResizeCorner = useCallback(
    (cx: number, cy: number, obj: LayoutObject): string | null => {
      const margin = 12; // canvas pixels
      const corners: Record<string, { x: number; y: number }> = {
        nw: { x: obj.x, y: obj.y },
        ne: { x: obj.x + obj.width, y: obj.y },
        sw: { x: obj.x, y: obj.y + obj.height },
        se: { x: obj.x + obj.width, y: obj.y + obj.height },
      };
      for (const [name, pos] of Object.entries(corners)) {
        if (Math.abs(cx - pos.x) < margin && Math.abs(cy - pos.y) < margin) {
          return name;
        }
      }
      return null;
    },
    [],
  );

  // Mouse down on overlay
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!editing) return;
      const coords = toCanvasCoords(e.clientX, e.clientY);
      if (!coords) return;
      const { cx, cy } = coords;

      if (tool === "delete") {
        const obj = findObjectAt(cx, cy);
        if (obj) {
          setObjects((prev) => prev.filter((o) => o.id !== obj.id));
          setSelectedId(null);
        }
        return;
      }

      // Select tool
      const obj = findObjectAt(cx, cy);
      if (obj) {
        setSelectedId(obj.id);
        // Check if near corner for resize
        const corner = getResizeCorner(cx, cy, obj);
        if (corner) {
          setDragState({
            type: "resize",
            startX: cx,
            startY: cy,
            objStartX: obj.x,
            objStartY: obj.y,
            objStartW: obj.width,
            objStartH: obj.height,
            corner,
          });
        } else {
          setDragState({
            type: "move",
            startX: cx,
            startY: cy,
            objStartX: obj.x,
            objStartY: obj.y,
            objStartW: obj.width,
            objStartH: obj.height,
          });
        }
      } else {
        setSelectedId(null);
      }
    },
    [editing, tool, toCanvasCoords, findObjectAt, getResizeCorner],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!editing) return;

      // Handle palette drag preview
      if (dragSpriteRef.current) {
        const coords = toCanvasCoords(e.clientX, e.clientY);
        if (coords) {
          const info = dragSpriteRef.current;
          const pImg = getMapObj(info.name);
          const pw = pImg ? pImg.naturalWidth : info.defaultW;
          const ph = pImg ? pImg.naturalHeight : info.defaultH;
          setDropPreview({
            sprite: info.name,
            x: snapToTile(coords.cx - pw / 2),
            y: snapToTile(coords.cy - ph / 2),
            w: pw,
            h: ph,
          });
        }
        return;
      }

      if (!dragState || !selectedId) return;
      const coords = toCanvasCoords(e.clientX, e.clientY);
      if (!coords) return;
      const { cx, cy } = coords;
      const dx = cx - dragState.startX;
      const dy = cy - dragState.startY;

      setObjects((prev) =>
        prev.map((obj) => {
          if (obj.id !== selectedId) return obj;
          if (dragState.type === "move") {
            return {
              ...obj,
              x: snapToGrid(dragState.objStartX + dx),
              y: snapToGrid(dragState.objStartY + dy),
            };
          }
          // Resize
          let newX = dragState.objStartX, newY = dragState.objStartY;
          let newW = dragState.objStartW, newH = dragState.objStartH;
          const corner = dragState.corner!;
          if (corner.includes("e")) {
            newW = Math.max(TILE, snapToGrid(dragState.objStartW + dx));
          }
          if (corner.includes("w")) {
            newW = Math.max(TILE, snapToGrid(dragState.objStartW - dx));
            newX = snapToGrid(dragState.objStartX + (dragState.objStartW - newW));
          }
          if (corner.includes("s")) {
            newH = Math.max(TILE, snapToGrid(dragState.objStartH + dy));
          }
          if (corner.includes("n")) {
            newH = Math.max(TILE, snapToGrid(dragState.objStartH - dy));
            newY = snapToGrid(dragState.objStartY + (dragState.objStartH - newH));
          }
          // Aspect ratio lock
          if (lockAspectRatio && obj.sprite) {
            const img = getMapObj(obj.sprite);
            if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
              const aspect = img.naturalWidth / img.naturalHeight;
              // Use the dominant axis based on which corner is being dragged
              const dxAbs = Math.abs(dx);
              const dyAbs = Math.abs(dy);
              if (dxAbs >= dyAbs) {
                // Width drives height
                newH = Math.max(TILE, snapToGrid(Math.round(newW / aspect)));
                if (corner.includes("n")) {
                  newY = snapToGrid(dragState.objStartY + dragState.objStartH - newH);
                }
              } else {
                // Height drives width
                newW = Math.max(TILE, snapToGrid(Math.round(newH * aspect)));
                if (corner.includes("w")) {
                  newX = snapToGrid(dragState.objStartX + dragState.objStartW - newW);
                }
              }
            }
          }
          return { ...obj, x: newX, y: newY, width: newW, height: newH };
        }),
      );
    },
    [editing, dragState, selectedId, toCanvasCoords, lockAspectRatio],
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);

    // Drop from palette
    if (dragSpriteRef.current && dropPreview) {
      const info = dragSpriteRef.current;
      // Use original image dimensions for faithful 1:1 rendering
      const srcImg = getMapObj(info.name);
      const dropW = srcImg ? srcImg.naturalWidth : info.defaultW;
      const dropH = srcImg ? srcImg.naturalHeight : info.defaultH;
      const newObj: LayoutObject = {
        id: genId(),
        sprite: info.name,
        x: dropPreview.x,
        y: dropPreview.y,
        width: dropW,
        height: dropH,
        zIndex: 20,
        walkable: false,
        category: info.category,
      };
      setObjects((prev) => [...prev, newObj]);
      setSelectedId(newObj.id);
      dragSpriteRef.current = null;
      setDropPreview(null);
    }
  }, [dropPreview]);

  // Keyboard: Delete key
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedId) {
        setObjects((prev) => prev.filter((o) => o.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, selectedId, onCancel]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    const updated: OfficeLayout = {
      ...layout,
      objects: objects,
    };
    const result = await saveLayout(updated, PASSWORD);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error || "Save failed");
      return;
    }
    onSave(updated);
  }, [layout, objects, onSave]);

  // Toggle palette category
  const toggleCategory = (key: string) => {
    setOpenCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Start drag from palette
  const handlePaletteDragStart = (info: SpriteInfo) => {
    dragSpriteRef.current = info;
  };

  // Selected object
  const selectedObj = objects.find((o) => o.id === selectedId);

  // ── Render ────────────────────────────────────────────────

  // Secret button (always visible): tiny area at bottom-right corner
  if (!editing && !showPasswordPrompt) {
    return (
      <div
        className="absolute"
        style={{
          bottom: 0,
          right: 0,
          width: TILE,
          height: TILE,
          opacity: 0.01,
          cursor: "default",
        }}
        onClick={handleSecretClick}
      />
    );
  }

  // Password prompt
  if (showPasswordPrompt && !editing) {
    return (
      <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
        <div
          className="bg-gray-900 border border-cyan-500 rounded-lg p-4 w-64"
          style={{ imageRendering: "auto" }}
        >
          <p className="text-gray-300 text-sm mb-2 font-mono">Enter password:</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
            className="w-full bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-cyan-400"
            autoFocus
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={handlePasswordSubmit}
              className="flex-1 py-1 bg-cyan-600 text-white rounded text-xs hover:bg-cyan-500"
            >
              Enter
            </button>
            <button
              onClick={() => { setShowPasswordPrompt(false); setPassword(""); }}
              className="flex-1 py-1 bg-gray-700 text-gray-300 rounded text-xs hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Editor mode
  const scale = getScale();

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-20"
      style={{ imageRendering: "auto" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Grid overlay (drawn via CSS) */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)
          `,
          backgroundSize: `${TILE * scale}px ${TILE * scale}px`,
        }}
      />

      {/* Selection box */}
      {selectedObj && (() => {
        const p1 = fromCanvasCoords(selectedObj.x, selectedObj.y);
        const p2 = fromCanvasCoords(selectedObj.x + selectedObj.width, selectedObj.y + selectedObj.height);
        if (!p1 || !p2) return null;
        const overlay = overlayRef.current?.getBoundingClientRect();
        if (!overlay) return null;
        const left = p1.dx - overlay.left;
        const top = p1.dy - overlay.top;
        const width = p2.dx - p1.dx;
        const height = p2.dy - p1.dy;
        return (
          <>
            {/* Blue selection border */}
            <div
              className="absolute pointer-events-none border-2 border-cyan-400"
              style={{ left, top, width, height }}
            />
            {/* Resize handles */}
            {["nw", "ne", "sw", "se"].map((corner) => {
              const hx = corner.includes("e") ? left + width - 4 : left - 4;
              const hy = corner.includes("s") ? top + height - 4 : top - 4;
              const cursor =
                corner === "nw" || corner === "se" ? "nwse-resize" :
                "nesw-resize";
              return (
                <div
                  key={corner}
                  className="absolute bg-cyan-400 border border-cyan-600"
                  style={{
                    left: hx,
                    top: hy,
                    width: 8,
                    height: 8,
                    cursor,
                    pointerEvents: "auto",
                  }}
                />
              );
            })}
          </>
        );
      })()}

      {/* Drop preview */}
      {dropPreview && (() => {
        const p1 = fromCanvasCoords(dropPreview.x, dropPreview.y);
        const p2 = fromCanvasCoords(dropPreview.x + dropPreview.w, dropPreview.y + dropPreview.h);
        if (!p1 || !p2) return null;
        const overlay = overlayRef.current?.getBoundingClientRect();
        if (!overlay) return null;
        return (
          <div
            className="absolute pointer-events-none border-2 border-dashed border-green-400 bg-green-400/10"
            style={{
              left: p1.dx - overlay.left,
              top: p1.dy - overlay.top,
              width: p2.dx - p1.dx,
              height: p2.dy - p1.dy,
            }}
          />
        );
      })()}

      {/* Top toolbar */}
      <div
        className="absolute top-2 left-2 right-[220px] flex gap-1 z-30"
        style={{ pointerEvents: "auto" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setTool("select")}
          className={`px-3 py-1 rounded text-xs font-mono ${
            tool === "select" ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Select
        </button>
        <button
          onClick={() => setTool("delete")}
          className={`px-3 py-1 rounded text-xs font-mono ${
            tool === "delete" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Delete
        </button>
        <div className="flex-1" />
        <button
          onClick={() => exportLayout({ ...layout, objects })}
          className="px-3 py-1 bg-gray-800 text-gray-300 rounded text-xs font-mono hover:bg-gray-700"
          onMouseDown={(e) => e.stopPropagation()}
        >
          Export
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-3 py-1 rounded text-xs font-mono ${
            saving ? "bg-gray-600 text-gray-400 cursor-wait" : "bg-green-700 text-white hover:bg-green-600"
          }`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saveError && (
          <span className="px-2 py-1 text-red-400 text-xs font-mono">{saveError}</span>
        )}
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-xs font-mono hover:bg-gray-600"
          onMouseDown={(e) => e.stopPropagation()}
        >
          Cancel
        </button>
      </div>

      {/* Right-side sprite palette */}
      <div
        className="absolute top-0 right-0 w-[210px] h-full bg-gray-900/90 border-l border-gray-700 overflow-y-auto z-30"
        style={{ pointerEvents: "auto" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-2">
          <p className="text-gray-400 text-xs font-mono mb-2 text-center">Sprites</p>
          {CATEGORIES.map((cat) => (
            <div key={cat.key} className="mb-1">
              <button
                onClick={() => toggleCategory(cat.key)}
                className="w-full text-left px-2 py-1 text-xs font-mono text-gray-300 bg-gray-800 rounded hover:bg-gray-700 flex justify-between"
              >
                <span>{cat.label}</span>
                <span>{openCategories[cat.key] ? "-" : "+"}</span>
              </button>
              {openCategories[cat.key] && (
                <div className="grid grid-cols-3 gap-1 p-1 mt-1">
                  {PALETTE_SPRITES.filter((s) => s.category === cat.key).map((info) => (
                    <div
                      key={info.name}
                      className="flex flex-col items-center cursor-grab bg-gray-800 rounded p-1 hover:bg-gray-700"
                      draggable={false}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handlePaletteDragStart(info);
                        // Use document-level mousemove/mouseup for palette drag
                        const srcI = getMapObj(info.name);
                        const iW = srcI ? srcI.naturalWidth : info.defaultW;
                        const iH = srcI ? srcI.naturalHeight : info.defaultH;
                        const onMove = (me: MouseEvent) => {
                          const coords = toCanvasCoords(me.clientX, me.clientY);
                          if (coords) {
                            setDropPreview({
                              sprite: info.name,
                              x: snapToTile(coords.cx - iW / 2),
                              y: snapToTile(coords.cy - iH / 2),
                              w: iW,
                              h: iH,
                            });
                          }
                        };
                        const onUp = (me: MouseEvent) => {
                          document.removeEventListener("mousemove", onMove);
                          document.removeEventListener("mouseup", onUp);
                          const coords = toCanvasCoords(me.clientX, me.clientY);
                          if (coords && dragSpriteRef.current) {
                            const newObj: LayoutObject = {
                              id: genId(),
                              sprite: info.name,
                              x: snapToTile(coords.cx - iW / 2),
                              y: snapToTile(coords.cy - iH / 2),
                              width: iW,
                              height: iH,
                              zIndex: 20,
                              walkable: false,
                              category: info.category,
                            };
                            setObjects((prev) => [...prev, newObj]);
                            setSelectedId(newObj.id);
                          }
                          dragSpriteRef.current = null;
                          setDropPreview(null);
                        };
                        document.addEventListener("mousemove", onMove);
                        document.addEventListener("mouseup", onUp);
                      }}
                    >
                      <img
                        src={`/sprites/map-objects/${info.name}.png`}
                        alt={info.name}
                        className="w-14 h-14 object-contain"
                        style={{ imageRendering: "pixelated" }}
                        draggable={false}
                      />
                      <span className="text-[8px] text-gray-400 mt-0.5 truncate w-full text-center">
                        {info.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Selected object info */}
      {selectedObj && (() => {
        const spriteImg = selectedObj.sprite ? getMapObj(selectedObj.sprite) : undefined;
        const natW = spriteImg?.naturalWidth ?? 0;
        const natH = spriteImg?.naturalHeight ?? 0;
        const aspect = natW > 0 && natH > 0 ? natW / natH : 0;

        const updateField = (field: "x" | "y" | "width" | "height", raw: string) => {
          const v = parseInt(raw, 10);
          if (isNaN(v) || v < 0) return;
          setObjects((prev) =>
            prev.map((o) => {
              if (o.id !== selectedObj.id) return o;
              const updated = { ...o, [field]: v };
              // Aspect ratio coupling for width/height
              if (lockAspectRatio && aspect > 0) {
                if (field === "width") {
                  updated.height = Math.max(TILE, Math.round(v / aspect));
                } else if (field === "height") {
                  updated.width = Math.max(TILE, Math.round(v * aspect));
                }
              }
              return updated;
            })
          );
        };

        return (
          <div
            className="absolute bottom-2 left-2 bg-gray-900/90 border border-gray-700 rounded p-2 text-xs font-mono text-gray-300 z-30"
            style={{ pointerEvents: "auto", minWidth: 260 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-1">{selectedObj.id}</div>
            <div className="mb-1">sprite: {selectedObj.sprite || "(special)"}</div>
            {natW > 0 && (
              <div className="mb-1 text-gray-500">
                original: {natW} x {natH}
              </div>
            )}
            {/* Coordinate & size inputs */}
            <div className="grid grid-cols-4 gap-1 mb-1">
              {(["x", "y", "width", "height"] as const).map((field) => (
                <label key={field} className="flex flex-col">
                  <span className="text-gray-500 text-[9px]">{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                  <input
                    type="number"
                    value={selectedObj[field]}
                    onChange={(e) => updateField(field, e.target.value)}
                    className="w-full bg-gray-800 text-white border border-gray-600 rounded px-1 py-0.5 text-xs font-mono focus:outline-none focus:border-cyan-400"
                    min={0}
                    step={TILE}
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2 items-center mb-1">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={lockAspectRatio}
                  onChange={(e) => setLockAspectRatio(e.target.checked)}
                />
                Lock Aspect Ratio
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={selectedObj.walkable}
                  onChange={(e) => {
                    setObjects((prev) =>
                      prev.map((o) =>
                        o.id === selectedObj.id ? { ...o, walkable: e.target.checked } : o
                      )
                    );
                  }}
                />
                walkable
              </label>
              <button
                onClick={() => {
                  setObjects((prev) => prev.filter((o) => o.id !== selectedObj.id));
                  setSelectedId(null);
                }}
                className="px-2 py-0.5 bg-red-800 text-red-200 rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
