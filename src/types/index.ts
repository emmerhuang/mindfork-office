export type MemberStatus = "idle" | "working" | "meeting" | "sleeping" | "celebrating";

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
}
