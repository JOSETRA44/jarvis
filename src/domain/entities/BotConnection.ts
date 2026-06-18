import type { Platform } from './Session.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface BotConnection {
  platform: Platform;
  status: ConnectionStatus;
  identifier: string | null;
  lastConnectedAt: Date | null;
  error: string | null;
}
