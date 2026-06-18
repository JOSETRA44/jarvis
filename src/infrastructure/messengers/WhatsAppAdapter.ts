import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import { mkdirSync } from 'fs';
import type { IMessengerAdapter, IncomingMessage, MessengerStatus } from '../../domain/ports/IMessengerAdapter.js';

type MessageHandler = (msg: IncomingMessage) => Promise<void>;
type StatusHandler = (status: MessengerStatus) => void;

export class WhatsAppAdapter implements IMessengerAdapter {
  readonly platform = 'whatsapp' as const;

  private sock: WASocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private currentStatus: MessengerStatus = {
    platform: 'whatsapp',
    status: 'disconnected',
    identifier: null,
  };

  private onQR?: (qr: string) => void;

  constructor(
    private authPath: string,
    private authType: 'qr' | 'code',
    private phoneNumber?: string,
    onQR?: (qrDataUrl: string) => void
  ) {
    this.onQR = onQR;
  }

  async connect(): Promise<void> {
    mkdirSync(this.authPath, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: 'silent' });

    this.sock = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ['JARVIS', 'Chrome', '1.0'],
      printQRInTerminal: this.authType === 'qr',
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async ({ qr, connection, lastDisconnect }) => {
      if (qr && this.authType === 'qr') {
        const dataUrl = await QRCode.toDataURL(qr);
        this.onQR?.(dataUrl);
        this.emitStatus('connecting');
      }

      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        this.emitStatus('disconnected');
        if (shouldReconnect) {
          setTimeout(() => this.connect(), 5000);
        }
      }

      if (connection === 'open') {
        const id = this.sock?.user?.id?.split(':')[0] ?? null;
        this.currentStatus = { platform: 'whatsapp', status: 'connected', identifier: id };
        this.statusHandlers.forEach((h) => h(this.currentStatus));
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          '';
        if (!text) continue;

        const incoming: IncomingMessage = {
          id: msg.key.id ?? '',
          from: msg.key.remoteJid ?? '',
          platform: 'whatsapp',
          text,
          isGroup: msg.key.remoteJid?.endsWith('@g.us') ?? false,
          timestamp: new Date((msg.messageTimestamp as number) * 1000),
        };

        for (const handler of this.messageHandlers) {
          await handler(incoming).catch(console.error);
        }
      }
    });
  }

  async disconnect(): Promise<void> {
    await this.sock?.logout();
    this.sock = null;
    this.emitStatus('disconnected');
  }

  async sendText(to: string, text: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp no conectado');
    await this.sock.sendMessage(to, { text });
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

  private emitStatus(status: MessengerStatus['status']): void {
    this.currentStatus = { ...this.currentStatus, status };
    this.statusHandlers.forEach((h) => h(this.currentStatus));
  }
}
