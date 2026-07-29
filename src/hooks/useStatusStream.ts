"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MemberStatus, MemberProfile, ChatChannelSummary } from "@/types";

interface Metrics {
  rateLimitPercent: number;
  pendingTasks: number;
  totalCostUsd?: number;
  modelName?: string;
  contextUsedPercent?: number;
  updatedAt?: string;
  resetAt?: string;
}

interface StatusData {
  metrics: Metrics | null;
  memberStatuses: Record<string, { status: MemberStatus; task: string }>;
  memberOs: Record<
    string,
    Array<{ text: string; task?: string; at?: string }>
  >;
  taskQueue: Array<{
    id: number;
    task: string;
    status: string;
    assigned_to?: string;
    received_at?: string;
    note?: string;
  }>;
  meetingActive: boolean;
  memberProfiles: MemberProfile[];
  chatSummaries: ChatChannelSummary[];
}

/** Retry delay: exponential backoff capped at 30s */
function retryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30_000);
}

/** applyData 接受的形狀（fallback 輪詢與 SSE 共用） */
type StatusPayload = Parameters<
  (d: {
    metrics?: Metrics;
    members?: Record<string, { status: MemberStatus; task: string }>;
    memberOs?: Record<string, Array<{ text: string; task?: string; at?: string }>>;
    taskQueue?: StatusData["taskQueue"];
    meeting?: { active: boolean };
    memberProfiles?: MemberProfile[];
    chatSummaries?: ChatChannelSummary[];
  }) => void
>[0];

/**
 * fallback 輪詢要打的 URL。
 *
 * 帶上一輪的 fingerprint，讓 server 先跑 cheap detect（45 列）、沒變就直接回
 * { unchanged: true } 而不跑完整 batch（679 列）。首載沒有 fingerprint 時不帶
 * 參數，server 行為與加閘門前完全相同。
 *
 * fingerprint 形如 `status:2026-07-28T09:30:18+08:00|chat_ch:...|msg_max:3308`，
 * 含 '+' 與 '|'。**必須 encodeURIComponent**：query string 裡未編碼的 '+' 會被
 * 解成空白，server 收到的 fp 永遠對不上、閘門等於沒裝。
 */
export function buildStatusUrl(lastFingerprint: string): string {
  return lastFingerprint
    ? `/api/status?fp=${encodeURIComponent(lastFingerprint)}`
    : "/api/status";
}

/**
 * 執行一次 fallback 輪詢，回傳下一輪要帶的 fingerprint。
 *
 * - unchanged 回應不呼叫 apply（避免用空資料覆蓋畫面）
 * - 回應非 2xx 或沒帶 fingerprint（例如 server 還是舊版）→ 保留舊 fingerprint，
 *   不推進；否則下一輪會誤判成已同步
 * - fetch 例外往上拋，由呼叫端的 catch 保住舊 fingerprint
 */
export async function pollStatusOnce(
  lastFingerprint: string,
  fetchFn: typeof fetch,
  apply: (data: StatusPayload) => void
): Promise<string> {
  const res = await fetchFn(buildStatusUrl(lastFingerprint));
  if (!res.ok) return lastFingerprint;

  const data = (await res.json()) as StatusPayload & {
    unchanged?: boolean;
    fingerprint?: string;
  };

  if (!data.unchanged) apply(data);

  return typeof data.fingerprint === "string" && data.fingerprint
    ? data.fingerprint
    : lastFingerprint;
}

/**
 * SSE-based status stream hook. Falls back to polling if SSE fails repeatedly.
 * Auto-reconnects on disconnect with exponential backoff.
 */
export function useStatusStream(): StatusData {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [memberStatuses, setMemberStatuses] = useState<
    Record<string, { status: MemberStatus; task: string }>
  >({});
  const [memberOs, setMemberOs] = useState<
    Record<string, Array<{ text: string; task?: string; at?: string }>>
  >({});
  const [taskQueue, setTaskQueue] = useState<
    Array<{
      id: number;
      task: string;
      status: string;
      assigned_to?: string;
      received_at?: string;
      note?: string;
    }>
  >([]);
  const [meetingActive, setMeetingActive] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState<MemberProfile[]>([]);
  const [chatSummaries, setChatSummaries] = useState<ChatChannelSummary[]>([]);

  const retryCount = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** fallback 輪詢上一輪拿到的 cheap fingerprint（空字串 = 尚未同步過） */
  const lastFingerprintRef = useRef("");

  const applyData = useCallback(
    (data: {
      metrics?: Metrics;
      members?: Record<string, { status: MemberStatus; task: string }>;
      memberOs?: Record<
        string,
        Array<{ text: string; task?: string; at?: string }>
      >;
      taskQueue?: Array<{
        id: number;
        task: string;
        status: string;
        assigned_to?: string;
        received_at?: string;
        note?: string;
      }>;
      meeting?: { active: boolean };
      memberProfiles?: MemberProfile[];
      chatSummaries?: ChatChannelSummary[];
    }) => {
      if (data.metrics) setMetrics(data.metrics);
      if (data.members && Object.keys(data.members).length > 0) {
        const members = { ...data.members };
        if (data.meeting?.active) {
          for (const key of Object.keys(members)) {
            members[key] = { ...members[key], status: "meeting" };
          }
        }
        setMemberStatuses(members);
      }
      if (data.memberOs) setMemberOs(data.memberOs);
      if (data.taskQueue) setTaskQueue(data.taskQueue);
      if (data.meeting) setMeetingActive(!!data.meeting.active);
      if (data.memberProfiles && data.memberProfiles.length > 0) setMemberProfiles(data.memberProfiles);
      if (data.chatSummaries) setChatSummaries(data.chatSummaries);
    },
    []
  );

  /**
   * Fallback: 每 15 秒打一次 /api/status，兩段式（2026-07-28 Forge）。
   *
   * 改動前每輪都拿完整 payload，正式庫實測一輪 679 列、卡住一天 391 萬列。
   * 改成把上一輪的 fingerprint 帶回去，server 沒偵測到變動就只回
   * { unchanged: true }（一輪 45 列）。間隔維持 15 秒——fallback 觸發的前提是
   * SSE 已連 5 次失敗、使用者手上只剩這條路，不能再把它拉慢。
   */
  const startFallbackPolling = useCallback(() => {
    if (fallbackRef.current) return; // already polling

    const poll = async () => {
      try {
        lastFingerprintRef.current = await pollStatusOnce(
          lastFingerprintRef.current,
          (input, init) => fetch(input, init),
          applyData
        );
      } catch {
        /* 例外時保留舊 fingerprint，下一輪重試 */
      }
    };

    poll(); // immediate first fetch
    fallbackRef.current = setInterval(poll, 15_000);
  }, [applyData]);

  const stopFallbackPolling = useCallback(() => {
    if (fallbackRef.current) {
      clearInterval(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;

      // Stop fallback polling when SSE connects
      stopFallbackPolling();

      const es = new EventSource("/api/status/stream");
      esRef.current = es;

      es.addEventListener("status", (event) => {
        try {
          const data = JSON.parse(event.data);
          applyData(data);
          retryCount.current = 0; // reset on success
        } catch {
          /* malformed JSON */
        }
      });

      es.addEventListener("error", () => {
        es.close();
        esRef.current = null;

        if (cancelled) return;

        retryCount.current += 1;

        // After 5 consecutive failures, fall back to polling
        if (retryCount.current > 5) {
          startFallbackPolling();
          return;
        }

        const delay = retryDelay(retryCount.current);
        reconnectTimer = setTimeout(connect, delay);
      });
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      stopFallbackPolling();
    };
  }, [applyData, startFallbackPolling, stopFallbackPolling]);

  return { metrics, memberStatuses, memberOs, taskQueue, meetingActive, memberProfiles, chatSummaries };
}
