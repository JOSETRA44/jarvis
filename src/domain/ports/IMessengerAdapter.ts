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

/** A single inline button (Telegram-style; ignored on WhatsApp). */
export interface KeyboardButton {
  text: string;
  /** Callback data — max 64 bytes. Prefix with "j:" to namespace JARVIS data. */
  data: string;
}

/** Handle to a sent message so it can be edited later. */
export interface MessageHandle {
  messageId: string;
}

export interface IMessengerAdapter {
  readonly platform: Platform;
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  sendText(to: string, text: string): Promise<void>;

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  onStatusChange(handler: (status: MessengerStatus) => void): void;
  getStatus(): MessengerStatus;

  // ── Optional rich-UI capabilities (implemented by Telegram, no-ops on WhatsApp) ──

  /** Send a message with an inline keyboard. Returns a handle for future edits. */
  sendWithKeyboard?(to: string, text: string, keyboard: KeyboardButton[][]): Promise<MessageHandle>;

  /**
   * Edit a previously sent message in place.
   * Use for live terminal updates — debounce to respect Telegram's rate limits.
   */
  editMessage?(to: string, messageId: string, text: string, keyboard?: KeyboardButton[][]): Promise<void>;

  /** Register a handler for inline button presses. */
  onCallbackQuery?(handler: CallbackHandler): void;

  /** Must be called within 30s of receiving a callback query to dismiss the loading indicator. */
  answerCallback?(callbackId: string, text?: string): Promise<void>;
}

export type CallbackHandler = (queryId: string, from: string, data: string) => Promise<void>;
