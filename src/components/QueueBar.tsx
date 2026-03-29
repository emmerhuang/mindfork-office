"use client";

interface QueueBarProps {
  /** Number of pending tasks in the queue */
  pendingTasks: number;
}

export default function QueueBar({ pendingTasks }: QueueBarProps) {
  const maxSegments = 10;
  const isOverload = pendingTasks > maxSegments;
  const filledSegments = Math.min(pendingTasks, maxSegments);

  function getColor(index: number): string {
    if (index < 3) return "#4ade80"; // green
    if (index < 6) return "#facc15"; // yellow
    if (index < 8) return "#f97316"; // orange
    return "#ef4444"; // red
  }

  return (
    <div className="flex items-center gap-3">
      <span className="pixel-text text-[10px] text-gray-400 whitespace-nowrap">
        QUEUE
      </span>
      <div className="flex gap-[2px]">
        {Array.from({ length: maxSegments }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-5 border border-gray-700 ${
              isOverload && i < maxSegments ? "animate-overload-blink" : ""
            }`}
            style={{
              background: i < filledSegments ? getColor(i) : "#1a1a2e",
              boxShadow: i < filledSegments
                ? `inset 0 -2px 0 0 rgba(0,0,0,0.3)`
                : "none",
            }}
          />
        ))}
      </div>
      {isOverload ? (
        <span className="pixel-text text-xs font-bold text-red-500 animate-overload-blink">
          OVERLOAD!
        </span>
      ) : (
        <span className="pixel-text text-[10px] text-gray-500">
          {pendingTasks}/{maxSegments}
        </span>
      )}
    </div>
  );
}
