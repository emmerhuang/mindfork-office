"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MemberStatus } from "@/types";

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
}

/** Retry delay: exponential backoff capped at 30s */
function retryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30_000);
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

  const retryCount = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    },
    []
  );

  /** Fallback: plain fetch polling every 15s */
  const startFallbackPolling = useCallback(() => {
    if (fallbackRef.current) return; // already polling

    const poll = async () => {
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          const data = await res.json();
          applyData(data);
        }
      } catch {
        /* ignore */
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

  return { metrics, memberStatuses, memberOs, taskQueue, meetingActive };
}
