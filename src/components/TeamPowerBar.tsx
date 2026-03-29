"use client";

interface TeamPowerBarProps {
  /** Rate limit percentage (0-100). Team power = 100 - rateLimit */
  rateLimitPercent: number;
}

export default function TeamPowerBar({ rateLimitPercent }: TeamPowerBarProps) {
  const power = Math.max(0, Math.min(100, 100 - rateLimitPercent));
  const segments = 20;
  const filledSegments = Math.round((power / 100) * segments);

  function getColor(index: number, total: number): string {
    const ratio = index / total;
    if (ratio > 0.6) return "#4ade80"; // green
    if (ratio > 0.3) return "#facc15"; // yellow
    return "#ef4444"; // red
  }

  return (
    <div className="flex items-center gap-3">
      <span className="pixel-text text-[10px] text-gray-500 whitespace-nowrap">
        戰力(5H)
      </span>
      <div className="flex gap-[2px]">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className="w-3 h-5 border border-gray-300 rounded-[1px]"
            style={{
              background: i < filledSegments ? getColor(i, segments) : "#e5e7eb",
              boxShadow: i < filledSegments
                ? `inset 0 -2px 0 0 rgba(0,0,0,0.3)`
                : "none",
            }}
          />
        ))}
      </div>
      <span
        className="pixel-text text-sm font-bold min-w-[3ch] text-right"
        style={{
          color: power > 60 ? "#4ade80" : power > 30 ? "#facc15" : "#ef4444",
        }}
      >
        {power}%
      </span>
    </div>
  );
}
