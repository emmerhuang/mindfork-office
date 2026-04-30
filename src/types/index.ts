export type MemberStatus = "idle" | "working" | "meeting" | "sleeping" | "celebrating";

export type CharacterPose = "standing" | "walking" | "sitting" | "drinking" | "sleeping";

/** Static profile data (from Turso member_profiles) */
export interface MemberProfile {
  id: string;
  name: string;
  nameCn: string;
  role: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  deskItems: string;
  traits: string;
  personality: string;
  recentTasks: string[];
  selfIntro?: string;
}

/** Dynamic status from Turso members key */
export interface MemberDynamicStatus {
  status: MemberStatus;
  task: string;
  updatedAt?: string;
}

/** Combined: profile + dynamic status (for components that need both) */
export interface MemberData extends MemberProfile {
  currentTask: string;
  status: MemberStatus;
}

/** Chat message in a channel summary */
export interface ChatMessage {
  /** id 加入後支援上拉分頁（before_id 游標） */
  id?: number;
  sender: string;
  content: string;
  created_at: string;
}

/**
 * Chat channel summary (synced from SQLite via Turso).
 *
 * Phase 2 改版：
 * - 新增 last_message / last_sender / message_count（自 chat_channels 表）
 * - messages 仍保留為「最新 N 筆預載」，但不再期待是「全部」
 * - 上拉分頁透過 /api/chat/messages?channel_id=&before_id=&limit= 取得更舊
 *
 * fallback：當 chat_channels 表為空（cleanup 還沒跑過）時，後端會
 * 從 chat_messages 即時聚合 last_*，以維持 dashboard 不空白。
 */
export interface ChatChannelSummary {
  channel_id: string;
  participant_a: string;
  participant_b: string;
  last_at: string;
  /** 最後一則訊息預覽（≤ 100 chars，server 已截斷）*/
  last_message?: string;
  /** 最後一則訊息 sender id */
  last_sender?: string;
  /** 該頻道未歸檔訊息總數（給 unread 計算用，省一次掃描）*/
  message_count?: number;
  /** 預載最新 N 筆（Phase 2 預設 50；舊版會塞「全部 ≤500/總額」）*/
  messages: ChatMessage[];
}
