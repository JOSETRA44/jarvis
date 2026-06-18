export type Platform = 'whatsapp' | 'telegram';
export type SessionStatus = 'active' | 'idle' | 'closed';

export interface Session {
  id: string;
  operatorId: string;
  platform: Platform;
  pid: number | null;
  cwd: string;
  status: SessionStatus;
  createdAt: Date;
  lastActivityAt: Date;
}
