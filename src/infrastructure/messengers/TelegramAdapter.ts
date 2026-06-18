import { Bot } from 'grammy';
import type { IMessengerAdapter, IncomingMessage, MessengerStatus } from '../../domain/ports/IMessengerAdapter.js';

type MessageHandler = (msg: IncomingMessage) => Promise<void>;
type StatusHandler = (status: MessengerStatus) => void;

// Commands registered in Telegram's / menu for discoverability.
// Users can type /cd, /dir, /git etc. — they are forwarded to the shell.
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

export class TelegramAdapter implements IMessengerAdapter {
  readonly platform = 'telegram' as const;

  private bot: Bot | null = null;
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
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

    this.bot.catch((err) => {
      console.error('[Telegram] Error:', err);
    });

    const me = await this.bot.api.getMe();

    // Register bot commands so they appear in the / autocomplete menu
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
