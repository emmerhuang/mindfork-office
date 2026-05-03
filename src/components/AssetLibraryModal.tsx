"use client";

import { useState, useEffect, useCallback } from "react";

interface Asset {
  id: string;
  name: string;
  category: string;
  filename: string;
  width: string;
  height: string;
  created_at: string;
}

const CATEGORIES = [
  "floor", "wall", "office", "tearoom", "meeting", "decoration", "emote",
];

export default function AssetLibraryModal({ onClose }: { onClose: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");

  // Admin gate: cookie may already be valid from a prior session.
  // null = checking, false = prompt password, true = authorised.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);

  // Probe cookie on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin-auth", { credentials: "same-origin" });
        const data = await r.json().catch(() => ({}));
        setAuthed(Boolean(data?.ok));
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  const submitPassword = useCallback(async () => {
    setPwError("");
    try {
      const r = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password: pwInput }),
      });
      if (r.ok) {
        setAuthed(true);
        setPwInput("");
      } else {
        setPwError("Wrong password");
        setPwInput("");
      }
    } catch {
      setPwError("Network error");
    }
  }, [pwInput]);

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/assets");
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets ?? []);
      } else {
        setError("Failed to load assets");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed === true) fetchAssets();
  }, [authed, fetchAssets]);

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm(`Delete asset "${id}"? File will be moved to _recycle.`)) return;
    setDeleting(id);
    try {
      const res = await fetch("/api/assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        await fetchAssets();
      }
    } finally {
      setDeleting(null);
    }
  };

  const filtered = filterCat === "all" ? assets : assets.filter((a) => a.category === filterCat);

  // Admin gate: while probing or unauthorised, render a minimal password prompt
  // instead of the modal contents. Server enforces the gate independently.
  if (authed !== true) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-cyan-500 rounded-lg p-4 w-72 text-white font-mono">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-300 text-sm">Admin password</p>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
          </div>
          {authed === null ? (
            <p className="text-gray-500 text-xs">Checking session…</p>
          ) : (
            <>
              <input
                type="password"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void submitPassword(); }}
                className="w-full bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-cyan-400"
                autoFocus
              />
              {pwError && <p className="text-red-400 text-xs mt-1">{pwError}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { void submitPassword(); }}
                  className="flex-1 py-1 bg-cyan-600 text-white rounded text-xs hover:bg-cyan-500"
                >Enter</button>
                <button
                  onClick={onClose}
                  className="flex-1 py-1 bg-gray-700 text-gray-300 rounded text-xs hover:bg-gray-600"
                >Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col text-white font-mono">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-bold">
            <span className="text-blue-400">Asset</span>{" "}
            <span className="text-orange-400">Library</span>
            <span className="text-gray-500 ml-2 text-sm">{assets.length} items</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">&times;</button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Filter bar */}
          <div className="px-4 py-2 border-b border-gray-800 flex gap-1 flex-wrap">
            <button
              onClick={() => setFilterCat("all")}
              className={`px-2 py-0.5 rounded text-xs ${filterCat === "all" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setFilterCat(c)}
                className={`px-2 py-0.5 rounded text-xs capitalize ${filterCat === c ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Asset grid */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loading ? (
              <p className="text-gray-500 text-center py-8">Loading...</p>
            ) : error ? (
              <p className="text-red-400 text-center py-8">{error}</p>
            ) : filtered.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No assets found.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {filtered.map((asset) => (
                  <div
                    key={asset.id}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-2 flex flex-col items-center group relative"
                  >
                    <div className="w-full aspect-square flex items-center justify-center mb-1">
                      <img
                        src={`/sprites/map-objects/${asset.filename}`}
                        alt={asset.name}
                        className="max-w-full max-h-full"
                        style={{ imageRendering: "pixelated" }}
                      />
                    </div>
                    <div className="text-[10px] text-gray-300 truncate w-full text-center" title={asset.name}>
                      {asset.name}
                    </div>
                    <div className="text-[9px] text-gray-500 capitalize">{asset.category}</div>
                    {asset.width && asset.height && parseInt(asset.width) > 0 && (
                      <div className="text-[9px] text-gray-600">{asset.width}x{asset.height}</div>
                    )}
                    {/* Delete button */}
                    <button
                      onClick={() => handleDelete(asset.id)}
                      disabled={deleting === asset.id}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-800/80 text-red-200 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      title="Delete"
                    >
                      {deleting === asset.id ? "..." : "x"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
