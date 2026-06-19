import { Bot } from 'grammy';
import type {
  IMessengerAdapter,
  IncomingMessage,
  MessengerStatus,
  KeyboardButton,
  MessageHandle,
  CallbackHandler,
} from '../../domain/ports/IMessengerAdapter.js';

type MessageHandler = (msg: IncomingMessage) => Promise<void>;
type StatusHandler = (status: MessengerStatus) => void;

// Commands registered in Telegram's / menu for discoverability.
const TELEGRAM_COMMANDS = [
  { command: 'help',   description: 'Mostrar ayuda completa' },
  { command: 'pwd',    description: 'Ver directorio actual' },
  { command: 'reset',  description: 'Reiniciar shell desde el directorio inicial' },
  { command: 'status', description: 'Ver sesiones de shell activas' },
  { command: 'cd',     description: 'Cambiar directorio · ej: /cd source\\proyecto' },
  { command: 'dir',    description: 'Listar archivos del directorio actual' },
  { command: 'ls',     description: 'Listar archivos (alias de dir)' },
  { command: 'git',    description: 'Ejecutar git · ej: /git status' },
  { command: 'npm',    description: 'Ejecutar npm · ej: /npm run dev' },
  { command: 'gemini', description: 'Lanzar Gemini CLI · ej: /gemini "explica esto"' },
  { command: 'claude', description: 'Lanzar Claude CLI · ej: /claude "revisa esto"' },
];

function toInlineKeyboard(keyboard: KeyboardButton[][]) {
  return {
    inline_keyboard: keyboard.map((row) =>
      row.map((btn) => ({ text: btn.text, callback_data: btn.data }))
    ),
  };
}

export class TelegramAdapter implements IMessengerAdapter {
  readonly platform = 'telegram' as const;

  private bot: Bot | null = null;
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private callbackHandlers: CallbackHandler[] = [];
  private currentStatus: MessengerStatus = {
    platform: 'telegram',
    status: 'disconnected',
    identifier: null,
  };

  constructor(private token: string) {}

  async connect(): Promise<void> {
    this.bot = new Bot(this.token);

    this.bot.on('message:text', async (ctx) => {
      const msg: IncomingMessage = {
        id: String(ctx.message.message_id),
        from: String(ctx.message.chat.id),
        platform: 'telegram',
        text: ctx.message.text,
        isGroup: ctx.message.chat.type !== 'private',
        timestamp: new Date(ctx.message.date * 1000),
      };
      for (const handler of this.messageHandlers) {
        await handler(msg).catch(console.error);
      }
    });

    this.bot.on('callback_query:data', async (ctx) => {
      const queryId = ctx.callbackQuery.id;
      const from = String(ctx.callbackQuery.from.id);
      const data = ctx.callbackQuery.data;
      for (const handler of this.callbackHandlers) {
        await handler(queryId, from, data).catch(console.error);
      }
    });

    this.bot.catch((err) => {
      console.error('[Telegram] Error:', err);
    });

    const me = await this.bot.api.getMe();

    await this.bot.api.setMyCommands(TELEGRAM_COMMANDS).catch((err) => {
      console.warn('[Telegram] No se pudo registrar comandos:', err.message);
    });

    this.currentStatus = {
      platform: 'telegram',
      status: 'connected',
      identifier: `@${me.username}`,
    };
    this.statusHandlers.forEach((h) => h(this.currentStatus));

    this.bot.start({ drop_pending_updates: true });
  }

  async disconnect(): Promise<void> {
    await this.bot?.stop();
    this.bot = null;
    this.currentStatus = { platform: 'telegram', status: 'disconnected', identifier: null };
    this.statusHandlers.forEach((h) => h(this.currentStatus));
  }

  async sendText(to: string, text: string): Promise<void> {
    if (!this.bot) throw new Error('Telegram no conectado');
    await this.bot.api.sendMessage(Number(to), text, { parse_mode: 'Markdown' });
  }

  async sendWithKeyboard(to: string, text: string, keyboard: KeyboardButton[][]): Promise<MessageHandle> {
    if (!this.bot) throw new Error('Telegram no conectado');
    const result = await this.bot.api.sendMessage(Number(to), text, {
      parse_mode: 'Markdown',
      reply_markup: toInlineKeyboard(keyboard),
    });
    return { messageId: String(result.message_id) };
  }

  async editMessage(to: string, messageId: string, text: string, keyboard?: KeyboardButton[][]): Promise<void> {
    if (!this.bot) return;
    await this.bot.api.editMessageText(Number(to), Number(messageId), text, {
      parse_mode: 'Markdown',
      ...(keyboard ? { reply_markup: toInlineKeyboard(keyboard) } : {}),
    }).catch(() => {}); // silently ignore "not modified" / already deleted errors
  }

  onCallbackQuery(handler: CallbackHandler): void {
    this.callbackHandlers.push(handler);
  }

  async answerCallback(callbackId: string, text?: string): Promise<void> {
    await this.bot?.api.answerCallbackQuery(callbackId, { text }).catch(() => {});
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onStatusChange(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  getStatus(): MessengerStatus {
    return this.currentStatus;
  }
}
