"use client";

interface TeamPowerBarProps {
  rateLimitPercent: number;
}

export default function TeamPowerBar({ rateLimitPercent }: TeamPowerBarProps) {
  const power = Math.max(0, Math.min(100, 100 - rateLimitPercent));

  const barColor = power > 60 ? "#4ade80" : power > 30 ? "#facc15" : "#ef4444";

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="pixel-text text-[8px] text-amber-700/60 w-10 shrink-0">戰力</span>
      <div className="flex-1 h-3 bg-gray-300/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${power}%`, background: barColor }}
        />
      </div>
      <span
        className="pixel-text text-[9px] font-bold w-8 text-right shrink-0"
        style={{ color: barColor }}
      >
        {power}%
      </span>
    </div>
  );
}
