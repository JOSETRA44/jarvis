import type { Platform } from '../entities/Session.js';
import type { ConnectionStatus } from '../entities/BotConnection.js';

export interface IncomingMessage {
  id: string;
  from: string;
  platform: Platform;
  text: string;
  isGroup: boolean;
  timestamp: Date;
}

export interface MessengerStatus {
  platform: Platform;
  status: ConnectionStatus;
  identifier: string | null;
}

export interface IMessengerAdapter {
  platform: Platform;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendText(to: string, text: string): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  onStatusChange(handler: (status: MessengerStatus) => void): void;
  getStatus(): MessengerStatus;
}
