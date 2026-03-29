export type MemberStatus = "idle" | "working" | "meeting" | "sleeping" | "celebrating";

export type CharacterPose = "standing" | "walking" | "sitting" | "drinking" | "sleeping";

export interface MemberData {
  id: string;
  name: string;
  nameCn: string;
  role: string;
  description: string;
  currentTask: string;
  status: MemberStatus;
  primaryColor: string;
  secondaryColor: string;
  deskItems: string;
  traits: string;
  personality: string;
  recentTasks: string[];
}
