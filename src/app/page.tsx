"use client";

import OfficeCanvas from "@/components/office-v3/OfficeCanvas";
import SleepScene from "@/components/SleepScene";
import { useStatusStream } from "@/hooks/useStatusStream";
import packageJson from "../../package.json";

const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "dev";

export default function Home() {
  const { metrics, memberStatuses, memberOs, taskQueue, meetingActive } =
    useStatusStream();

  const power = metrics && metrics.rateLimitPercent >= 0 ? 100 - metrics.rateLimitPercent : null;
  const powerColor = power === null ? "#999" : power > 60 ? "#22c55e" : power > 30 ? "#eab308" : "#ef4444";
  const isSleeping = metrics ? metrics.rateLimitPercent >= 90 : false;

  return (
    <div className="h-screen w-screen bg-[#D4CFC8] flex flex-col overflow-auto">
      {/* Office Canvas — title rendered as watermark on floor */}
      <main className="flex-1 min-h-0">
        {isSleeping ? (
          <div className="h-full flex items-center justify-center">
            <SleepScene resetAt={metrics?.resetAt} />
          </div>
        ) : (
          <OfficeCanvas
            memberStatuses={memberStatuses}
            memberOs={memberOs}
            taskQueue={taskQueue}
            meetingActive={meetingActive}
            metrics={metrics ? {
              rateLimitPercent: metrics.rateLimitPercent,
              pendingTasks: metrics.pendingTasks,
              totalCostUsd: metrics.totalCostUsd,
              modelName: metrics.modelName,
              contextUsedPercent: metrics.contextUsedPercent,
            } : undefined}
            onCharacterClick={() => {}}
            className="w-full h-full"
          />
        )}
      </main>

      {/* Version info */}
      <div className="fixed bottom-1 right-1 text-[9px] text-white opacity-50 pointer-events-none" suppressHydrationWarning>
        v{packageJson.version} | {BUILD_TIME}
      </div>
    </div>
  );
}
