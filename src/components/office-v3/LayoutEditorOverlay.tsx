"use client";

// LayoutEditorOverlay.tsx — Visual drag-and-drop layout editor
// Overlays on top of the canvas. Coordinates are converted from DOM to canvas space.

import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import { TILE, CANVAS_W, CANVAS_H, COLS, ROWS, ROOMS, updateRooms } from "./officeData";
import { saveLayout, exportLayout } from "./LayoutManager";
import { MAP_OBJ_NAMES, getMapObj } from "./TileRenderer";
import type { OfficeLayout, LayoutObject, RoomFloor } from "./LayoutManager";

// ── Sprite palette categories ────────────────────────────────

interface SpriteInfo {
  name: string;
  category: string;
  defaultW: number;
  defaultH: number;
  special?: string;  // for trigger zones
}

const PALETTE_SPRITES: SpriteInfo[] = [
  // Floor (96x96)
  { name: "floor-gray-carpet", category: "floor", defaultW: 96, defaultH: 96 },
  { name: "floor-honey-wood", category: "floor", defaultW: 96, defaultH: 96 },
  { name: "floor-walnut", category: "floor", defaultW: 96, defaultH: 96 },
  { name: "floor-marble", category: "floor", defaultW: 96, defaultH: 96 },
  { name: "floor-beige-wood", category: "floor", defaultW: 96, defaultH: 96 },
  { name: "floor-lavender", category: "floor", defaultW: 96, defaultH: 96 },
  { name: "floor-herringbone", category: "floor", defaultW: 96, defaultH: 96 },
  { name: "floor-slate", category: "floor", defaultW: 96, defaultH: 96 },
  { name: "floor-terracotta", category: "floor", defaultW: 96, defaultH: 96 },
  { name: "floor-bamboo", category: "floor", defaultW: 96, defaultH: 96 },
  // Walls
  { name: "wall-bookshelf", category: "wall", defaultW: 240, defaultH: 160 },
  { name: "wall-window", category: "wall", defaultW: 160, defaultH: 240 },
  { name: "wall-whiteboard", category: "wall", defaultW: 160, defaultH: 240 },
  { name: "wall-clock", category: "wall", defaultW: 64, defaultH: 64 },
  { name: "wall-panoramic-window", category: "wall", defaultW: 240, defaultH: 160 },
  { name: "wall-shelf-painting", category: "wall", defaultW: 240, defaultH: 160 },
  // Office
  { name: "desk-monitor", category: "office", defaultW: 240, defaultH: 160 },
  { name: "desk-laptop", category: "office", defaultW: 240, defaultH: 160 },
  { name: "desk-standing", category: "office", defaultW: 240, defaultH: 160 },
  { name: "dog-bed", category: "office", defaultW: 240, defaultH: 160 },
  { name: "sofa-teal", category: "office", defaultW: 240, defaultH: 160 },
  { name: "filing-cabinet", category: "office", defaultW: 160, defaultH: 240 },
  { name: "printer", category: "office", defaultW: 160, defaultH: 160 },
  // Tearoom
  { name: "fridge", category: "tearoom", defaultW: 160, defaultH: 240 },
  { name: "fridge-retro", category: "tearoom", defaultW: 160, defaultH: 240 },
  { name: "water-cooler", category: "tearoom", defaultW: 160, defaultH: 240 },
  { name: "coffee-machine", category: "tearoom", defaultW: 160, defaultH: 240 },
  { name: "coffee-machine-red", category: "tearoom", defaultW: 160, defaultH: 240 },
  { name: "kitchen-counter", category: "tearoom", defaultW: 240, defaultH: 160 },
  { name: "kitchen-cabinet-south", category: "tearoom", defaultW: 400, defaultH: 400 },
  { name: "kitchen-cabinet-east", category: "tearoom", defaultW: 400, defaultH: 400 },
  { name: "kitchen-cabinet-north", category: "tearoom", defaultW: 400, defaultH: 400 },
  { name: "kitchen-cabinet-west", category: "tearoom", defaultW: 400, defaultH: 400 },
  { name: "cafe-table", category: "tearoom", defaultW: 160, defaultH: 240 },
  { name: "vending-machine", category: "tearoom", defaultW: 160, defaultH: 240 },
  { name: "trash-can", category: "tearoom", defaultW: 160, defaultH: 160 },
  { name: "bar-table", category: "tearoom", defaultW: 160, defaultH: 240 },
  { name: "fruit-bowl", category: "tearoom", defaultW: 160, defaultH: 160 },
  { name: "microwave", category: "tearoom", defaultW: 160, defaultH: 160 },
  // Meeting
  { name: "conference-table", category: "meeting", defaultW: 160, defaultH: 240 },
  { name: "conference-table-wide", category: "meeting", defaultW: 400, defaultH: 300 },
  { name: "conference-table-west", category: "meeting", defaultW: 300, defaultH: 400 },
  { name: "projector-screen", category: "meeting", defaultW: 240, defaultH: 160 },
  { name: "projector-screen-wide", category: "meeting", defaultW: 400, defaultH: 300 },
  { name: "projector-screen-west", category: "meeting", defaultW: 300, defaultH: 400 },
  { name: "tv-screen", category: "meeting", defaultW: 240, defaultH: 160 },
  { name: "long-table-north", category: "meeting", defaultW: 400, defaultH: 300 },
  { name: "long-table-east", category: "meeting", defaultW: 300, defaultH: 400 },
  // Decoration
  { name: "plant-monstera", category: "decoration", defaultW: 160, defaultH: 240 },
  { name: "plant-cactus", category: "decoration", defaultW: 160, defaultH: 240 },
  { name: "succulents", category: "decoration", defaultW: 160, defaultH: 160 },
  { name: "tree-indoor", category: "decoration", defaultW: 160, defaultH: 240 },
  { name: "table-lamp", category: "decoration", defaultW: 160, defaultH: 240 },
  { name: "painting-landscape", category: "decoration", defaultW: 200, defaultH: 200 },
  { name: "painting-abstract", category: "decoration", defaultW: 200, defaultH: 200 },
  { name: "painting-portrait", category: "decoration", defaultW: 200, defaultH: 200 },
  // Text
  { name: "text-block", category: "text", defaultW: 400, defaultH: 60, special: "text" },
  // Trigger zones
  { name: "trigger-dashboard", category: "trigger", defaultW: 192, defaultH: 192, special: "trigger-dashboard" },
  { name: "trigger-bulletin", category: "trigger", defaultW: 384, defaultH: 192, special: "trigger-bulletin" },
];

const CATEGORIES = [
  { key: "floor", label: "Floor" },
  { key: "wall", label: "Wall" },
  { key: "office", label: "Office" },
  { key: "tearoom", label: "Tearoom" },
  { key: "meeting", label: "Meeting" },
  { key: "decoration", label: "Decoration" },
  { key: "text", label: "Text" },
  { key: "trigger", label: "Trigger Zone" },
];

const PASSWORD = "emmer99";

/** Handle exposed via ref for external triggers */
export interface LayoutEditorHandle {
  triggerPasswordPrompt: () => void;
}

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
  onPreview?: (objects: LayoutObject[], floors?: { work: RoomFloor; tearoom: RoomFloor; meetingRoom: RoomFloor }) => void;
}

type Tool = "select" | "delete";

type RoomKey = "work" | "tearoom" | "meetingRoom";

/** Detect which room a canvas point falls in */
function detectRoom(cx: number, cy: number): RoomKey | null {
  const rooms: Array<{ key: RoomKey; r: { x: number; y: number; w: number; h: number } }> = [
    { key: "work", r: ROOMS.work },
    { key: "tearoom", r: ROOMS.tearoom },
    { key: "meetingRoom", r: ROOMS.meetingRoom },
  ];
  for (const { key, r } of rooms) {
    const px = r.x * TILE;
    const py = r.y * TILE;
    const pw = r.w * TILE;
    const ph = r.h * TILE;
    if (cx >= px && cx < px + pw && cy >= py && cy < py + ph) return key;
  }
  return null;
}

const ROOM_LABELS: Record<RoomKey, string> = {
  work: "Work Area",
  tearoom: "Tearoom",
  meetingRoom: "Meeting Room",
};

const LayoutEditorOverlay = forwardRef<LayoutEditorHandle, Props>(function LayoutEditorOverlay({ layout, onSave, onCancel, canvasRef, onPreview }, ref) {
  const [editing, setEditing] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const originalObjectsRef = useRef<LayoutObject[]>([]);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  useImperativeHandle(ref, () => ({
    triggerPasswordPrompt: () => setShowPasswordPrompt(true),
  }));
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
  const [selectedRoom, setSelectedRoom] = useState<RoomKey | null>(null);
  const [floors, setFloors] = useState<{ work: RoomFloor; tearoom: RoomFloor; meetingRoom: RoomFloor }>({
    work: { color: "#D4CFC8" }, tearoom: { color: "#E8DFC8" }, meetingRoom: { color: "#D8D0E0" },
  });
  // Room boundary state
  const [wallRows, setWallRows] = useState(3);
  const [workRows, setWorkRows] = useState(14);
  const [tearoomCols, setTearoomCols] = useState(6);
  const [boundaryDrag, setBoundaryDrag] = useState<"wall" | "horizontal" | "vertical" | null>(null);
  const [hoverBoundary, setHoverBoundary] = useState<"wall" | "horizontal" | "vertical" | null>(null);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragSpriteRef = useRef<SpriteInfo | null>(null);

  const floorsRef = useRef(floors);
  floorsRef.current = floors;

  /** Shortcut: update objects state AND fire live preview in one call */
  const setObjectsAndPreview = useCallback((updater: (prev: LayoutObject[]) => LayoutObject[]) => {
    setObjects((prev) => {
      const next = updater(prev);
      onPreviewRef.current?.(next, floorsRef.current);
      return next;
    });
  }, []);

  /** Update a room's floor and fire live preview */
  const updateRoomFloor = useCallback((roomKey: RoomKey, floor: RoomFloor) => {
    setFloors((prev) => {
      const next = { ...prev, [roomKey]: floor };
      floorsRef.current = next;
      // Trigger preview with updated floors
      setObjects((objs) => {
        onPreviewRef.current?.(objs, next);
        return objs;
      });
      return next;
    });
  }, []);

  /** Apply room boundary changes: update ROOMS global + trigger rerender preview */
  const applyRoomBoundary = useCallback((newWallRows: number, newWorkRows: number, newTearoomCols: number) => {
    updateRooms(newWallRows, newWorkRows, newTearoomCols);
    // Trigger preview so floor + labels rerender with new ROOMS
    setObjects((objs) => {
      onPreviewRef.current?.(objs, floorsRef.current);
      return objs;
    });
  }, []);

  // Enter edit mode
  const handleSecretClick = useCallback(() => {
    setShowPasswordPrompt(true);
  }, []);

  const handlePasswordSubmit = useCallback(() => {
    if (password === PASSWORD) {
      const cloned = JSON.parse(JSON.stringify(layout.objects));
      originalObjectsRef.current = cloned;
      setObjects(cloned);
      // Initialize floors from layout
      const f = layout.floors ?? (layout.floorColors ? {
        work: { color: layout.floorColors.work },
        tearoom: { color: layout.floorColors.tearoom },
        meetingRoom: { color: layout.floorColors.meetingRoom },
      } : { work: { color: "#D4CFC8" }, tearoom: { color: "#E8DFC8" }, meetingRoom: { color: "#D8D0E0" } });
      setFloors(JSON.parse(JSON.stringify(f)));
      // Initialize room boundaries from layout
      const rc = layout.roomConfig ?? { wallRows: 3, workRows: 14, tearoomCols: 6 };
      setWallRows(rc.wallRows ?? 3);
      setWorkRows(rc.workRows);
      setTearoomCols(rc.tearoomCols);
      setEditing(true);
      setShowPasswordPrompt(false);
      setPassword("");
    } else {
      setPassword("");
    }
  }, [password, layout.objects, layout.floors, layout.floorColors, layout.roomConfig]);

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

      // Check boundary line hit (priority over object selection)
      const BOUNDARY_HIT = 10; // canvas pixels tolerance
      const wallLineY = ROOMS.wall.h * TILE;
      const hLineY = (ROOMS.work.y + ROOMS.work.h) * TILE;
      const vLineX = ROOMS.tearoom.w * TILE;
      const vLineTop = hLineY;

      if (Math.abs(cy - wallLineY) < BOUNDARY_HIT && cx >= 0 && cx <= CANVAS_W) {
        setBoundaryDrag("wall");
        setSelectedId(null);
        setSelectedRoom(null);
        return;
      }
      if (Math.abs(cy - hLineY) < BOUNDARY_HIT && cx >= 0 && cx <= CANVAS_W) {
        setBoundaryDrag("horizontal");
        setSelectedId(null);
        setSelectedRoom(null);
        return;
      }
      if (Math.abs(cx - vLineX) < BOUNDARY_HIT && cy >= vLineTop && cy <= CANVAS_H) {
        setBoundaryDrag("vertical");
        setSelectedId(null);
        setSelectedRoom(null);
        return;
      }

      if (tool === "delete") {
        const obj = findObjectAt(cx, cy);
        if (obj) {
          setObjectsAndPreview((prev) => prev.filter((o) => o.id !== obj.id));
          setSelectedId(null);
        }
        return;
      }

      // Select tool
      const obj = findObjectAt(cx, cy);
      if (obj) {
        setSelectedId(obj.id);
        setSelectedRoom(null);
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
        // Click on empty space — select the room
        const room = detectRoom(cx, cy);
        setSelectedRoom(room);
      }
    },
    [editing, tool, toCanvasCoords, findObjectAt, getResizeCorner],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!editing) return;

      const coords = toCanvasCoords(e.clientX, e.clientY);

      // Handle boundary drag
      if (boundaryDrag && coords) {
        const { cx, cy } = coords;
        if (boundaryDrag === "wall") {
          const newWallRows = Math.round(cy / TILE);
          const clamped = Math.max(1, Math.min(6, newWallRows));
          if (clamped !== wallRows) {
            const totalLower = ROWS - clamped;
            const newWork = Math.min(workRows, totalLower - 2);
            setWallRows(clamped);
            setWorkRows(newWork);
            applyRoomBoundary(clamped, newWork, tearoomCols);
          }
        } else if (boundaryDrag === "horizontal") {
          const newWorkRows = Math.round(cy / TILE) - wallRows;
          const clamped = Math.max(5, Math.min(ROWS - wallRows - 2, newWorkRows));
          if (clamped !== workRows) {
            setWorkRows(clamped);
            applyRoomBoundary(wallRows, clamped, tearoomCols);
          }
        } else {
          const newTearoomCols = Math.round(cx / TILE);
          const clamped = Math.max(2, Math.min(10, newTearoomCols));
          if (clamped !== tearoomCols) {
            setTearoomCols(clamped);
            applyRoomBoundary(wallRows, workRows, clamped);
          }
        }
        return;
      }

      // Hover detection for boundary lines (cursor change)
      if (!dragState && !dragSpriteRef.current && coords) {
        const BOUNDARY_HIT = 10;
        const wallLineY = ROOMS.wall.h * TILE;
        const hLineY = (ROOMS.work.y + ROOMS.work.h) * TILE;
        const vLineX = ROOMS.tearoom.w * TILE;
        const vLineTop = hLineY;
        const { cx, cy } = coords;
        if (Math.abs(cy - wallLineY) < BOUNDARY_HIT && cx >= 0 && cx <= CANVAS_W) {
          setHoverBoundary("wall");
        } else if (Math.abs(cy - hLineY) < BOUNDARY_HIT && cx >= 0 && cx <= CANVAS_W) {
          setHoverBoundary("horizontal");
        } else if (Math.abs(cx - vLineX) < BOUNDARY_HIT && cy >= vLineTop && cy <= CANVAS_H) {
          setHoverBoundary("vertical");
        } else {
          setHoverBoundary(null);
        }
      }

      // Handle palette drag preview
      if (dragSpriteRef.current) {
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
      if (!coords) return;
      const { cx, cy } = coords;
      const dx = cx - dragState.startX;
      const dy = cy - dragState.startY;

      setObjectsAndPreview((prev) =>
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
    [editing, dragState, selectedId, toCanvasCoords, lockAspectRatio, boundaryDrag, workRows, tearoomCols, applyRoomBoundary],
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
    setBoundaryDrag(null);

    // Drop from palette
    if (dragSpriteRef.current && dropPreview) {
      const info = dragSpriteRef.current;

      // Floor sprite drop: detect room and update floor
      if (info.category === "floor") {
        const centerX = dropPreview.x + dropPreview.w / 2;
        const centerY = dropPreview.y + dropPreview.h / 2;
        const room = detectRoom(centerX, centerY);
        if (room) {
          updateRoomFloor(room, { sprite: info.name, color: floors[room].color });
          setSelectedRoom(room);
          setSelectedId(null);
        }
        dragSpriteRef.current = null;
        setDropPreview(null);
        return;
      }

      // Use original image dimensions for faithful 1:1 rendering
      const srcImg = getMapObj(info.name);
      const dropW = srcImg ? srcImg.naturalWidth : info.defaultW;
      const dropH = srcImg ? srcImg.naturalHeight : info.defaultH;
      const newObj: LayoutObject = {
        id: genId(),
        sprite: info.special ? "" : info.name,
        x: dropPreview.x,
        y: dropPreview.y,
        width: dropW,
        height: dropH,
        zIndex: info.special ? 5 : 20,
        walkable: !!info.special,
        category: info.category,
        ...(info.special ? { special: info.special } : {}),
        ...(info.special === "text" ? { text: "Text", fontSize: 48, fontColor: "#000000", fontFamily: "'Courier New', monospace" } : {}),
      };
      setObjectsAndPreview((prev) => [...prev, newObj]);
      setSelectedId(newObj.id);
      dragSpriteRef.current = null;
      setDropPreview(null);
    }
  }, [dropPreview, setObjectsAndPreview, floors, updateRoomFloor]);

  // Keyboard: Delete key
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedId) {
        setObjectsAndPreview((prev) => prev.filter((o) => o.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, selectedId, onCancel, setObjectsAndPreview]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    const updated: OfficeLayout = {
      version: layout.version,
      floors,
      objects: objects,
      roomConfig: { wallRows, workRows, tearoomCols },
    };
    const result = await saveLayout(updated, PASSWORD);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error || "Save failed");
      return;
    }
    onSave(updated);
  }, [layout.version, objects, floors, onSave, workRows, tearoomCols]);

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
              Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Editor mode
  const scale = getScale();

  // Compute boundary line positions in DOM space
  const wallLineCanvasY = ROOMS.wall.h * TILE;
  const hLineCanvasY = (ROOMS.work.y + ROOMS.work.h) * TILE;
  const vLineCanvasX = ROOMS.tearoom.w * TILE;
  const wallLineDOM = fromCanvasCoords(0, wallLineCanvasY);
  const wallLineEnd = fromCanvasCoords(CANVAS_W, wallLineCanvasY);
  const hLineDOM = fromCanvasCoords(0, hLineCanvasY);
  const hLineEnd = fromCanvasCoords(CANVAS_W, hLineCanvasY);
  const vLineDOM = fromCanvasCoords(vLineCanvasX, hLineCanvasY);
  const vLineEnd = fromCanvasCoords(vLineCanvasX, CANVAS_H);

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-20"
      style={{
        imageRendering: "auto",
        cursor: boundaryDrag === "wall" || hoverBoundary === "wall"
          ? "row-resize"
          : boundaryDrag === "horizontal" || hoverBoundary === "horizontal"
          ? "row-resize"
          : boundaryDrag === "vertical" || hoverBoundary === "vertical"
          ? "col-resize"
          : undefined,
      }}
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

      {/* Wall boundary line (wall / work) */}
      {wallLineDOM && wallLineEnd && overlayRef.current && (() => {
        const ov = overlayRef.current!.getBoundingClientRect();
        const y = wallLineDOM.dy - ov.top;
        const isActive = boundaryDrag === "wall" || hoverBoundary === "wall";
        return (
          <div
            className="absolute pointer-events-none"
            style={{
              left: wallLineDOM.dx - ov.left,
              top: y - 2,
              width: (wallLineEnd.dx - wallLineDOM.dx),
              height: isActive ? 6 : 3,
              background: isActive ? "rgba(255,160,0,0.9)" : "rgba(255,160,0,0.5)",
              borderTop: "2px dashed rgba(255,200,0,0.8)",
              zIndex: 40,
            }}
          >
            <span className="absolute text-[9px] text-orange-300 bg-gray-900/80 px-1 rounded" style={{ top: -16, left: 4 }}>
              Wall: {wallRows} rows
            </span>
          </div>
        );
      })()}

      {/* Horizontal boundary line (work / tearoom+meeting) */}
      {hLineDOM && hLineEnd && overlayRef.current && (() => {
        const ov = overlayRef.current!.getBoundingClientRect();
        const y = hLineDOM.dy - ov.top;
        const isActive = boundaryDrag === "horizontal" || hoverBoundary === "horizontal";
        return (
          <div
            className="absolute pointer-events-none"
            style={{
              left: hLineDOM.dx - ov.left,
              top: y - (isActive ? 3 : 2),
              width: hLineEnd.dx - hLineDOM.dx,
              height: isActive ? 6 : 4,
              background: isActive ? "rgba(255,220,50,0.9)" : "rgba(255,220,50,0.6)",
              borderTop: `2px dashed ${isActive ? "#FFE066" : "#CCAA33"}`,
              transition: "height 0.1s, background 0.1s",
            }}
          />
        );
      })()}

      {/* Vertical boundary line (tearoom / meetingRoom) */}
      {vLineDOM && vLineEnd && overlayRef.current && (() => {
        const ov = overlayRef.current!.getBoundingClientRect();
        const x = vLineDOM.dx - ov.left;
        const isActive = boundaryDrag === "vertical" || hoverBoundary === "vertical";
        return (
          <div
            className="absolute pointer-events-none"
            style={{
              left: x - (isActive ? 3 : 2),
              top: vLineDOM.dy - ov.top,
              width: isActive ? 6 : 4,
              height: vLineEnd.dy - vLineDOM.dy,
              background: isActive ? "rgba(255,220,50,0.9)" : "rgba(255,220,50,0.6)",
              borderLeft: `2px dashed ${isActive ? "#FFE066" : "#CCAA33"}`,
              transition: "width 0.1s, background 0.1s",
            }}
          />
        );
      })()}

      {/* Boundary labels */}
      {hLineDOM && overlayRef.current && (() => {
        const ov = overlayRef.current!.getBoundingClientRect();
        return (
          <div
            className="absolute pointer-events-none text-[10px] font-mono font-bold px-1 rounded"
            style={{
              left: hLineDOM.dx - ov.left + 4,
              top: hLineDOM.dy - ov.top - 16,
              color: "#FFE066",
              background: "rgba(0,0,0,0.6)",
            }}
          >
            Work: {workRows} rows | Lower: {ROWS - 3 - workRows} rows
          </div>
        );
      })()}
      {vLineDOM && overlayRef.current && (() => {
        const ov = overlayRef.current!.getBoundingClientRect();
        return (
          <div
            className="absolute pointer-events-none text-[10px] font-mono font-bold px-1 rounded"
            style={{
              left: vLineDOM.dx - ov.left + 4,
              top: vLineDOM.dy - ov.top + 4,
              color: "#FFE066",
              background: "rgba(0,0,0,0.6)",
            }}
          >
            Tea: {tearoomCols} | Meet: {12 - tearoomCols}
          </div>
        );
      })()}

      {/* Text block overlays + Trigger zone overlays + anchor character labels */}
      {objects.map((obj) => {
        const isText = obj.special === "text";
        const isTrigger = obj.category === "trigger";
        const hasAnchor = !!obj.anchorCharId;
        if (!isText && !isTrigger && !hasAnchor) return null;
        const p1 = fromCanvasCoords(obj.x, obj.y);
        const p2 = fromCanvasCoords(obj.x + obj.width, obj.y + obj.height);
        if (!p1 || !p2) return null;
        const overlay = overlayRef.current?.getBoundingClientRect();
        if (!overlay) return null;
        const left = p1.dx - overlay.left;
        const top = p1.dy - overlay.top;
        const width = p2.dx - p1.dx;
        const height = p2.dy - p1.dy;

        if (isText) {
          return (
            <div
              key={obj.id}
              className="absolute pointer-events-none flex items-center justify-center overflow-hidden"
              style={{
                left, top, width, height,
                background: "rgba(255,255,255,0.08)",
                border: "1px dashed rgba(255,255,255,0.3)",
              }}
            >
              <span
                className="font-bold whitespace-nowrap"
                style={{
                  fontSize: Math.max(8, (obj.fontSize ?? 48) * (width / (obj.width || 400)) * 0.6),
                  color: obj.fontColor ?? "#000",
                  fontFamily: obj.fontFamily ?? "'Courier New', monospace",
                  opacity: 0.7,
                }}
              >
                {obj.text ?? "Text"}
              </span>
            </div>
          );
        }

        if (isTrigger) {
          const isDash = obj.special === "trigger-dashboard";
          const bgColor = isDash ? "rgba(59,130,246,0.25)" : "rgba(34,197,94,0.25)";
          const borderColor = isDash ? "rgba(59,130,246,0.6)" : "rgba(34,197,94,0.6)";
          const label = isDash ? "Dashboard" : "Hall of Fame";
          return (
            <div
              key={obj.id}
              className="absolute pointer-events-none flex items-center justify-center"
              style={{ left, top, width, height, background: bgColor, border: `2px dashed ${borderColor}` }}
            >
              <span className="text-white font-mono text-xs font-bold drop-shadow-md">{label}</span>
            </div>
          );
        }

        // Anchor character label
        const charName = obj.anchorCharId!.charAt(0).toUpperCase() + obj.anchorCharId!.slice(1);
        return (
          <div
            key={`anchor-${obj.id}`}
            className="absolute pointer-events-none"
            style={{ left: left + width + 2, top: top - 2 }}
          >
            <span className="bg-purple-700/80 text-white text-[9px] font-mono px-1 py-0.5 rounded whitespace-nowrap">
              {charName}
            </span>
          </div>
        );
      })}

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

      {/* Top toolbar — fixed to viewport top */}
      <div
        className="fixed top-0 left-0 right-0 flex gap-1 z-[60] px-2 py-1 bg-gray-900/90 border-b border-gray-700"
        style={{ pointerEvents: "auto" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setTool(tool === "delete" ? "select" : "delete")}
          className={`px-3 py-1 rounded text-xs font-mono ${
            tool === "delete" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          Delete
        </button>
        <div className="flex-1" />
        <button
          onClick={() => exportLayout({ version: layout.version, floors, objects, roomConfig: { workRows, tearoomCols } })}
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
          onClick={() => { setEditing(false); onCancel(); }}
          className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-xs font-mono hover:bg-gray-600"
          onMouseDown={(e) => e.stopPropagation()}
        >
          Exit
        </button>
      </div>

      {/* Left-side sprite palette — fixed to viewport left, collapsible */}
      {paletteCollapsed ? (
        <div
          className="fixed top-10 left-0 z-[55]"
          style={{ pointerEvents: "auto" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setPaletteCollapsed(false)}
            className="bg-gray-900/90 border border-gray-700 rounded-r-lg px-1.5 py-3 text-gray-400 hover:text-white hover:bg-gray-800 text-sm font-mono"
            title="Show Sprites"
          >
            &raquo;
          </button>
        </div>
      ) : (
      <div
        className="fixed top-10 left-0 w-[210px] bg-gray-900/90 border-r border-gray-700 overflow-y-auto z-[55]"
        style={{ pointerEvents: "auto", maxHeight: "calc(100vh - 40px)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-xs font-mono text-center flex-1">Sprites</p>
            <button
              onClick={() => setPaletteCollapsed(true)}
              className="text-gray-500 hover:text-white text-xs font-mono px-1"
              title="Collapse"
            >
              &laquo;
            </button>
          </div>
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
                            // Floor sprite: update room floor instead of adding object
                            if (info.category === "floor") {
                              const dropX = snapToTile(coords.cx - iW / 2) + iW / 2;
                              const dropY = snapToTile(coords.cy - iH / 2) + iH / 2;
                              const room = detectRoom(dropX, dropY);
                              if (room) {
                                updateRoomFloor(room, { sprite: info.name, color: floorsRef.current[room].color });
                                setSelectedRoom(room);
                                setSelectedId(null);
                              }
                            } else {
                              const newObj: LayoutObject = {
                                id: genId(),
                                sprite: info.special ? "" : info.name,
                                x: snapToTile(coords.cx - iW / 2),
                                y: snapToTile(coords.cy - iH / 2),
                                width: iW,
                                height: iH,
                                zIndex: info.special ? 5 : 20,
                                walkable: !!info.special,
                                category: info.category,
                                ...(info.special ? { special: info.special } : {}),
                                ...(info.special === "text" ? { text: "Text", fontSize: 48, fontColor: "#000000", fontFamily: "'Courier New', monospace" } : {}),
                              };
                              setObjectsAndPreview((prev) => [...prev, newObj]);
                              setSelectedId(newObj.id);
                            }
                          }
                          dragSpriteRef.current = null;
                          setDropPreview(null);
                        };
                        document.addEventListener("mousemove", onMove);
                        document.addEventListener("mouseup", onUp);
                      }}
                    >
                      {info.special ? (
                        info.special === "text" ? (
                          <div
                            className="w-14 h-14 flex items-center justify-center rounded"
                            style={{
                              background: "rgba(255,255,255,0.1)",
                              border: "2px dashed rgba(255,255,255,0.4)",
                            }}
                          >
                            <span className="text-white text-[10px] font-bold font-mono">Aa</span>
                          </div>
                        ) : (
                        <div
                          className="w-14 h-14 flex items-center justify-center rounded"
                          style={{
                            background: info.special === "trigger-dashboard"
                              ? "rgba(59,130,246,0.35)" : "rgba(34,197,94,0.35)",
                            border: `2px dashed ${info.special === "trigger-dashboard"
                              ? "rgba(59,130,246,0.7)" : "rgba(34,197,94,0.7)"}`,
                          }}
                        >
                          <span className="text-white text-[7px] font-bold text-center leading-tight">
                            {info.special === "trigger-dashboard" ? "Dash\nboard" : "Hall of\nFame"}
                          </span>
                        </div>
                        )
                      ) : (
                        <img
                          src={`/sprites/map-objects/${info.name}.png`}
                          alt={info.name}
                          className="w-14 h-14 object-contain"
                          style={{ imageRendering: "pixelated" }}
                          draggable={false}
                        />
                      )}
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
      )}

      {/* Selected object info */}
      {selectedObj && (() => {
        const spriteImg = selectedObj.sprite ? getMapObj(selectedObj.sprite) : undefined;
        const natW = spriteImg?.naturalWidth ?? 0;
        const natH = spriteImg?.naturalHeight ?? 0;
        const aspect = natW > 0 && natH > 0 ? natW / natH : 0;

        const updateField = (field: "x" | "y" | "width" | "height", raw: string) => {
          const v = parseInt(raw, 10);
          if (isNaN(v) || v < 0) return;
          setObjectsAndPreview((prev) =>
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
            className="absolute bg-gray-900/95 border border-cyan-500 rounded-lg p-3 text-xs font-mono text-gray-300 z-50 shadow-lg"
            style={{
              pointerEvents: "auto",
              width: 216,
              ...(() => {
                // Position panel to the left of the selected object
                const canvasEl = canvasRef?.current;
                if (!canvasEl) return { top: 60, left: 10 };
                const r = canvasEl.getBoundingClientRect();
                const canvasAspect = CANVAS_W / CANVAS_H;
                const boxAspect = r.width / r.height;
                let renderW: number, renderH: number, offsetX: number, offsetY: number;
                if (boxAspect > canvasAspect) {
                  renderH = r.height; renderW = renderH * canvasAspect;
                  offsetX = (r.width - renderW) / 2; offsetY = 0;
                } else {
                  renderW = r.width; renderH = renderW / canvasAspect;
                  offsetX = 0; offsetY = 0;
                }
                const scale = renderW / CANVAS_W;
                const panelLeft = offsetX + selectedObj.x * scale - 226;
                const panelTop = offsetY + selectedObj.y * scale;
                return {
                  top: Math.max(4, Math.min(panelTop, r.height - 300)),
                  left: Math.max(4, panelLeft),
                };
              })(),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-cyan-400 font-bold truncate">{selectedObj.sprite || selectedObj.id}</div>
            {natW > 0 && (
              <div className="mb-1 text-gray-500">original: {natW} × {natH}</div>
            )}
            {/* Change sprite dropdown — only for objects with a sprite, not trigger/text */}
            {selectedObj.sprite && !selectedObj.special && (() => {
              const sameCat = PALETTE_SPRITES.filter(
                (s) => s.category === selectedObj.category && !s.special
              );
              if (sameCat.length <= 1) return null;
              return (
                <label className="flex flex-col mb-1">
                  <span className="text-gray-500 text-[9px]">Change Sprite</span>
                  <select
                    value={selectedObj.sprite}
                    onChange={(e) => {
                      const newSprite = e.target.value;
                      if (newSprite === selectedObj.sprite) return;
                      const newImg = getMapObj(newSprite);
                      setObjectsAndPreview((prev) =>
                        prev.map((o) => {
                          if (o.id !== selectedObj.id) return o;
                          const updated = { ...o, sprite: newSprite };
                          if (newImg && newImg.naturalWidth > 0 && newImg.naturalHeight > 0) {
                            updated.width = newImg.naturalWidth;
                            updated.height = newImg.naturalHeight;
                          }
                          return updated;
                        })
                      );
                    }}
                    className="w-full bg-gray-800 text-white border border-gray-600 rounded px-1 py-0.5 text-xs font-mono focus:outline-none focus:border-cyan-400 cursor-pointer"
                  >
                    {sameCat.map((s) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </label>
              );
            })()}
            <div className="grid grid-cols-2 gap-1 mb-1">
              {(["x", "y", "width", "height"] as const).map((field) => (
                <label key={field} className="flex flex-col">
                  <span className="text-gray-500 text-[9px]">{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                  <input
                    type="number"
                    value={selectedObj[field]}
                    onChange={(e) => updateField(field, e.target.value)}
                    className="w-full bg-gray-800 text-white border border-gray-600 rounded px-1 py-0.5 text-xs font-mono focus:outline-none focus:border-cyan-400"
                    min={0}
                    step={1}
                  />
                </label>
              ))}
            </div>
            {natW > 0 && (() => {
              const curScale = (selectedObj.width / natW).toFixed(2);
              const doScale = (val: string) => {
                const s = parseFloat(val);
                if (isNaN(s) || s <= 0) return;
                setObjectsAndPreview((prev) =>
                  prev.map((o) =>
                    o.id === selectedObj.id
                      ? { ...o, width: Math.round(natW * s), height: Math.round(natH * s) }
                      : o
                  )
                );
              };
              return (
                <div className="flex gap-1 items-center mb-1">
                  <span className="text-gray-500 text-[9px]">Scale</span>
                  <input
                    type="number"
                    defaultValue={curScale}
                    key={curScale}
                    step={0.1}
                    min={0.1}
                    onBlur={(e) => doScale(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") doScale((e.target as HTMLInputElement).value); }}
                    className="w-16 bg-gray-800 text-white border border-gray-600 rounded px-1 py-0.5 text-xs font-mono focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-gray-500 text-[9px]">×</span>
                </div>
              );
            })()}
            <div className="flex gap-2 items-center mb-1">
              <label className="flex items-center gap-1 text-[10px]">
                <input type="checkbox" checked={lockAspectRatio} onChange={(e) => setLockAspectRatio(e.target.checked)} />
                Lock Ratio
              </label>
              <label className="flex items-center gap-1 text-[10px]">
                <input type="checkbox" checked={selectedObj.walkable} onChange={(e) => {
                  setObjectsAndPreview((prev) => prev.map((o) => o.id === selectedObj.id ? { ...o, walkable: e.target.checked } : o));
                }} />
                Walkable
              </label>
              <label className="flex flex-col text-[10px]">
                <span className="text-gray-500">Z</span>
                <input
                  type="number"
                  value={selectedObj.zIndex}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (isNaN(v)) return;
                    setObjectsAndPreview((prev) => prev.map((o) => o.id === selectedObj.id ? { ...o, zIndex: v } : o));
                  }}
                  className="w-10 bg-gray-800 text-white border border-gray-600 rounded px-1 py-0.5 text-xs font-mono"
                  step={1}
                />
              </label>
            </div>
            {/* Text block editing fields */}
            {selectedObj.special === "text" && (
              <div className="mb-1 border-t border-gray-700 pt-1 mt-1">
                <span className="text-gray-500 text-[9px] block mb-1">Text Properties</span>
                <label className="flex flex-col mb-1">
                  <span className="text-gray-500 text-[9px]">Text</span>
                  <input
                    type="text"
                    value={selectedObj.text ?? ""}
                    onChange={(e) => {
                      setObjectsAndPreview((prev) => prev.map((o) => o.id === selectedObj.id ? { ...o, text: e.target.value } : o));
                    }}
                    className="w-full bg-gray-800 text-white border border-gray-600 rounded px-1 py-0.5 text-xs font-mono focus:outline-none focus:border-cyan-400"
                  />
                </label>
                <div className="grid grid-cols-2 gap-1 mb-1">
                  <label className="flex flex-col">
                    <span className="text-gray-500 text-[9px]">Font Size</span>
                    <input
                      type="number"
                      value={selectedObj.fontSize ?? 48}
                      min={8}
                      max={200}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v > 0) {
                          setObjectsAndPreview((prev) => prev.map((o) => o.id === selectedObj.id ? { ...o, fontSize: v } : o));
                        }
                      }}
                      className="w-full bg-gray-800 text-white border border-gray-600 rounded px-1 py-0.5 text-xs font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-gray-500 text-[9px]">Color</span>
                    <input
                      type="color"
                      value={(() => {
                        const c = selectedObj.fontColor ?? "#000000";
                        // Convert rgba to hex for color input if needed
                        if (c.startsWith("#")) return c;
                        return "#000000";
                      })()}
                      onChange={(e) => {
                        setObjectsAndPreview((prev) => prev.map((o) => o.id === selectedObj.id ? { ...o, fontColor: e.target.value } : o));
                      }}
                      className="w-full h-6 rounded cursor-pointer border border-gray-600"
                    />
                  </label>
                </div>
                <label className="flex flex-col mb-1">
                  <span className="text-gray-500 text-[9px]">Font Color (raw)</span>
                  <input
                    type="text"
                    value={selectedObj.fontColor ?? ""}
                    onChange={(e) => {
                      setObjectsAndPreview((prev) => prev.map((o) => o.id === selectedObj.id ? { ...o, fontColor: e.target.value } : o));
                    }}
                    className="w-full bg-gray-800 text-white border border-gray-600 rounded px-1 py-0.5 text-xs font-mono focus:outline-none focus:border-cyan-400"
                    placeholder="rgba(0,0,0,0.12) or #000000"
                  />
                </label>
              </div>
            )}
            {/* Character offset for desks with anchorCharId */}
            {selectedObj.anchorCharId && (
              <div className="mb-1">
                <div className="text-[9px] text-purple-400 mb-0.5">Char Offset ({selectedObj.anchorCharId})</div>
                <div className="grid grid-cols-2 gap-1">
                  <label className="flex flex-col">
                    <span className="text-gray-500 text-[9px]">OffX</span>
                    <input
                      type="number"
                      value={selectedObj.charOffsetX ?? 0}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (isNaN(v)) return;
                        setObjectsAndPreview((prev) => prev.map((o) => o.id === selectedObj.id ? { ...o, charOffsetX: v } : o));
                      }}
                      className="w-full bg-gray-800 text-white border border-gray-600 rounded px-1 py-0.5 text-xs font-mono focus:outline-none focus:border-purple-400"
                      step={10}
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-gray-500 text-[9px]">OffY</span>
                    <input
                      type="number"
                      value={selectedObj.charOffsetY ?? 0}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (isNaN(v)) return;
                        setObjectsAndPreview((prev) => prev.map((o) => o.id === selectedObj.id ? { ...o, charOffsetY: v } : o));
                      }}
                      className="w-full bg-gray-800 text-white border border-gray-600 rounded px-1 py-0.5 text-xs font-mono focus:outline-none focus:border-purple-400"
                      step={10}
                    />
                  </label>
                </div>
              </div>
            )}
            <button
              onClick={() => { setSelectedId(null); }}
              className="w-full px-2 py-1 bg-green-800 text-green-200 rounded hover:bg-green-700 text-[10px]"
            >
              Confirm
            </button>
          </div>
        );
      })()}

      {/* Room panel (shown when clicking empty space in a room) */}
      {selectedRoom && !selectedObj && (() => {
        const room = ROOMS[selectedRoom];
        const roomFloor = floors[selectedRoom];
        const floorSprites = PALETTE_SPRITES.filter((s) => s.category === "floor");
        return (
          <div
            className="absolute bg-gray-900/95 border border-amber-500 rounded-lg p-3 text-xs font-mono text-gray-300 z-50 shadow-lg"
            style={{
              pointerEvents: "auto",
              width: 220,
              top: 60,
              left: 10,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-amber-400 font-bold">{ROOM_LABELS[selectedRoom]}</div>
            <div className="mb-1 text-gray-500 text-[9px]">
              Position: ({room.x}, {room.y}) | Size: {room.w} x {room.h} tiles
            </div>
            <div className="mb-2">
              <span className="text-gray-500 text-[9px] block mb-1">Floor Sprite</span>
              <div className="grid grid-cols-4 gap-1">
                {floorSprites.map((fs) => (
                  <div
                    key={fs.name}
                    className={`cursor-pointer rounded p-0.5 border ${
                      roomFloor.sprite === fs.name ? "border-amber-400 bg-amber-900/30" : "border-gray-700 hover:border-gray-500"
                    }`}
                    onClick={() => updateRoomFloor(selectedRoom, { ...roomFloor, sprite: fs.name })}
                  >
                    <img
                      src={`/sprites/map-objects/${fs.name}.png`}
                      alt={fs.name}
                      className="w-full h-10 object-contain"
                      style={{ imageRendering: "pixelated" }}
                      draggable={false}
                    />
                    <span className="text-[6px] text-gray-500 block text-center truncate">{fs.name.replace("floor-", "")}</span>
                  </div>
                ))}
                {/* Clear floor sprite option */}
                <div
                  className={`cursor-pointer rounded p-0.5 border flex flex-col items-center justify-center ${
                    !roomFloor.sprite ? "border-amber-400 bg-amber-900/30" : "border-gray-700 hover:border-gray-500"
                  }`}
                  onClick={() => updateRoomFloor(selectedRoom, { ...roomFloor, sprite: undefined })}
                >
                  <div className="w-full h-10 flex items-center justify-center">
                    <span className="text-gray-500 text-lg">X</span>
                  </div>
                  <span className="text-[6px] text-gray-500">none</span>
                </div>
              </div>
            </div>
            <div className="mb-2">
              <label className="flex items-center gap-2">
                <span className="text-gray-500 text-[9px]">Fallback Color</span>
                <input
                  type="color"
                  value={roomFloor.color}
                  onChange={(e) => updateRoomFloor(selectedRoom, { ...roomFloor, color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border border-gray-600"
                />
                <span className="text-gray-400 text-[9px]">{roomFloor.color}</span>
              </label>
            </div>
            <button
              onClick={() => setSelectedRoom(null)}
              className="w-full px-2 py-1 bg-green-800 text-green-200 rounded hover:bg-green-700 text-[10px]"
            >
              Confirm
            </button>
          </div>
        );
      })()}
    </div>
  );
});

export default LayoutEditorOverlay;
