"use client";

interface QueueBarProps {
  pendingTasks: number;
}

export default function QueueBar({ pendingTasks }: QueueBarProps) {
  const isUnknown = pendingTasks < 0;
  const maxTasks = 10;
  const isOverload = !isUnknown && pendingTasks > maxTasks;
  const fillPercent = isUnknown ? 0 : Math.min((pendingTasks / maxTasks) * 100, 100);

  const barColor = isUnknown ? "#9ca3af" : pendingTasks <= 3 ? "#4ade80" : pendingTasks <= 6 ? "#facc15" : "#ef4444";

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="pixel-text text-[8px] text-amber-700/60 w-10 shrink-0">待辦</span>
      <div className={`flex-1 h-3 bg-gray-300/50 rounded-full overflow-hidden ${isOverload ? "animate-overload-blink" : ""}`}>
        {!isUnknown && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${fillPercent}%`, background: barColor }}
          />
        )}
      </div>
      <span
        className={`pixel-text text-[9px] font-bold w-8 text-right shrink-0 ${isOverload ? "text-red-500 animate-overload-blink" : ""}`}
        style={!isOverload ? { color: barColor } : undefined}
      >
        {isUnknown ? "--" : `${isOverload ? "!" : ""}${pendingTasks}`}
      </span>
    </div>
  );
}
