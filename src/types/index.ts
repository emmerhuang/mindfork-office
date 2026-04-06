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
  sender: string;
  content: string;
  created_at: string;
}

/** Chat channel summary (synced from SQLite via Turso) */
export interface ChatChannelSummary {
  channel_id: string;
  participant_a: string;
  participant_b: string;
  last_at: string;
  messages: ChatMessage[];
}
