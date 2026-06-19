import type { IncomingMessage, IMessengerAdapter, KeyboardButton } from '../../domain/ports/IMessengerAdapter.js';
import type { AuthorizeOperatorUseCase } from '../AuthorizeOperator/AuthorizeOperatorUseCase.js';
import type { ICommandRepository } from '../../domain/ports/ICommandRepository.js';
import type { SessionManager } from '../../infrastructure/terminal/SessionManager.js';
import type { RateLimiter } from '../../infrastructure/security/RateLimiter.js';
import type { ISessionRepository } from '../../domain/ports/ISessionRepository.js';

const MAX_MSG_CHARS = 3800;
const LIVE_FRAME_MAX = 3000; // max chars of VirtualScreen snapshot shown in Telegram frame

// ── Inline keyboards ──────────────────────────────────────────────────────────

const CONTROL_KEYBOARD: KeyboardButton[][] = [
  [
    { text: '⌃C  Kill',  data: 'j:cc' },
    { text: '⌃D  EOF',   data: 'j:cd' },
  ],
  [
    { text: '↵ Enter',   data: 'j:en' },
    { text: 'Esc',       data: 'j:es' },
  ],
  [
    { text: '🔙 Salir',  data: 'j:ex' },
  ],
];

const NAV_KEYBOARD: KeyboardButton[][] = [
  [
    { text: '📄 dir',    data: 'j:nav:dir' },
    { text: '⬆ ..',     data: 'j:nav:..' },
    { text: '🏠 inicio', data: 'j:nav:home' },
  ],
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(text: string, max = MAX_MSG_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n…[${text.length - max} chars truncados]`;
}

function formatResult(cmd: string, output: string, exitCode: number, cwd: string, ms: number): string {
  const icon = exitCode === 0 ? '✅' : '❌';
  const header = `${icon} \`${cmd.slice(0, 60)}\``;
  const cwdLine = `📂 \`${cwd}\``;
  const timeLine = `⏱ ${ms}ms · exit ${exitCode}`;
  if (!output) return `${header}\n${cwdLine}\n${timeLine}\n_(sin output)_`;
  return `${header}\n${cwdLine}\n\`\`\`\n${truncate(output)}\n\`\`\`\n${timeLine}`;
}

/** Strip a leading / or \ from shell commands that are NOT JARVIS built-ins. */
function normalizeShellCommand(text: string): string {
  if ((text.startsWith('/') || text.startsWith('\\')) && text.length > 1) {
    return text.slice(1).trimStart();
  }
  return text;
}

/** True when the last line of the snapshot looks like a prompt waiting for input */
function seemsWaitingForInput(snapshot: string): boolean {
  const lastLine = snapshot.split('\n').filter((l) => l.trim()).pop() ?? '';
  return /[>$#%:?]\s*$/.test(lastLine.trim()) || /[❯▶]\s*$/.test(lastLine);
}

function buildFrameText(header: string, content: string, statusLine: string | null): string {
  const parts = [header];
  const trimmed = content.trim();
  if (trimmed) {
    const cap = truncate(trimmed, LIVE_FRAME_MAX);
    const waiting = !statusLine && seemsWaitingForInput(trimmed);
    parts.push('```\n' + cap + (waiting ? '\n▋' : '') + '\n```');
  }
  if (statusLine) parts.push(statusLine);
  return parts.join('\n');
}

// ── Live frame type ───────────────────────────────────────────────────────────

interface LiveFrame {
  messageId: string;
  header: string;
  content: string;
  timer: NodeJS.Timeout | null;
}

// ── Use case ──────────────────────────────────────────────────────────────────

export class RouteMessageUseCase {
  /** Per-operator Telegram live frame state */
  private liveFrames = new Map<string, LiveFrame>();

  /**
   * Tracks operators whose interactive process was intentionally killed
   * so the exit handler doesn't send a redundant "Proceso terminado" message.
   */
  private killedByUser = new Set<string>();

  constructor(
    private authorizeUC: AuthorizeOperatorUseCase,
    private sessionMgr: SessionManager,
    private commandRepo: ICommandRepository,
    private sessionRepo: ISessionRepository,
    private rateLimiter: RateLimiter,
    private onOutput?: (operatorId: string, chunk: string) => void
  ) {}

  // ── Callback query entry point ─────────────────────────────────────────────

  async handleCallback(queryId: string, from: string, data: string, adapter: IMessengerAdapter): Promise<void> {
    // Always dismiss the loading spinner promptly (Telegram requires answer within 30s)
    await adapter.answerCallback?.(queryId);

    if (!data.startsWith('j:')) return;

    const operator = await this.authorizeUC.execute(adapter.platform, from);
    if (!operator) return;

    const code = data.slice(2); // e.g. "cc", "ex", "nav:.."

    if (code.startsWith('nav:')) {
      await this.handleNavCallback(code.slice(4), operator.id, from, adapter);
      return;
    }

    const proc = this.sessionMgr.getInteractive(operator.id);

    switch (code) {
      case 'cc': proc?.writeRaw('\x03'); break;  // Ctrl+C
      case 'cd': proc?.writeRaw('\x04'); break;  // Ctrl+D
      case 'en': proc?.writeLine('');    break;  // Enter
      case 'es': proc?.writeRaw('\x1b'); break;  // Escape
      case 'ex': await this.exitInteractiveMode(operator.id, from, adapter); break;
    }
  }

  // ── Message entry point ────────────────────────────────────────────────────

  async handle(msg: IncomingMessage, adapter: IMessengerAdapter): Promise<void> {
    const text = msg.text.trim();
    if (!text) return;

    const operator = await this.authorizeUC.execute(msg.platform, msg.from);
    if (!operator) {
      await adapter.sendText(
        msg.from,
        '⛔ *No autorizado*\n' +
        'Tu número/ID no está en la lista de operadores de JARVIS.\n' +
        'Contacta al administrador en el dashboard.'
      );
      return;
    }

    // ── Interactive passthrough ────────────────────────────────────────
    if (this.sessionMgr.hasInteractive(operator.id)) {
      await this.handleInteractiveInput(text, operator.id, msg.from, adapter);
      return;
    }

    // ── Built-in JARVIS commands ───────────────────────────────────────
    // Checked BEFORE normalization so /help, /pwd etc. don't reach the shell.
    if (text === '/help' || text === '?' || text === '/ayuda' || text === 'help') {
      await adapter.sendText(msg.from, helpText(msg.platform));
      return;
    }

    if (text === '/reset') {
      this.sessionMgr.kill(operator.id);
      const defaultCwd = process.env.DEFAULT_CWD ?? 'C:\\Users\\USER';
      await adapter.sendText(msg.from, `🔄 Shell reiniciado.\nNuevo directorio: \`${defaultCwd}\``);
      return;
    }

    if (text === '/pwd' || text === '/cwd') {
      const shell = this.sessionMgr.get(operator.id);
      await adapter.sendText(msg.from, `📂 *Directorio actual:*\n\`${shell.cwd}\``);
      return;
    }

    if (text === '/status') {
      const sessions = this.sessionMgr.getActiveSessions();
      const lines = sessions
        .map((s) => `• \`${s.cwd}\`${s.interactive ? ' 🔀 interactivo' : ''}`)
        .join('\n');
      await adapter.sendText(msg.from, `🖥 *Sesiones activas:* ${sessions.length}\n${lines || '_ninguna_'}`);
      return;
    }

    // ── Normalize: strip leading / or \ before reaching the shell ─────
    const shellText = normalizeShellCommand(text);

    // ── Interactive mode trigger: ! prefix ─────────────────────────────
    if (shellText.startsWith('!') && shellText.length > 1) {
      const cmd = shellText.slice(1).trim();
      if (cmd) {
        await this.startInteractiveMode(operator.id, cmd, msg.from, adapter);
        return;
      }
    }

    // ── Rate limiting ──────────────────────────────────────────────────
    if (this.rateLimiter.isLimited(operator.id)) {
      await adapter.sendText(msg.from, '⏳ Demasiados comandos. Espera un momento.');
      return;
    }
    this.rateLimiter.record(operator.id);

    // ── Execute in persistent shell ────────────────────────────────────
    const shell = this.sessionMgr.get(operator.id);
    await adapter.sendText(msg.from, `⚙️ Ejecutando en \`${shell.cwd}\`…`);

    let or = await this.sessionRepo.findActiveByOperator(operator.id);
    if (!or) {
      or = await this.sessionRepo.create({
        operatorId: operator.id,
        platform: msg.platform,
        pid: null,
        cwd: shell.cwd,
        status: 'active',
      });
    }

    try {
      const result = await shell.execute(shellText, {
        timeoutMs: (parseInt(process.env.COMMAND_TIMEOUT_SECONDS ?? '60') || 60) * 1000,
        onChunk: (chunk) => this.onOutput?.(operator.id, chunk),
      });

      await this.sessionRepo.update(or.id, { cwd: result.cwd, status: 'idle' });

      await this.commandRepo.create({
        sessionId: or.id,
        operatorId: operator.id,
        input: shellText,
        output: result.output,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      });

      const resultText = formatResult(shellText, result.output, result.exitCode, result.cwd, result.durationMs);

      // Show navigation keyboard after a successful cd (Telegram only)
      const isCd = /^\s*(?:cd|chdir)(?:\s|$)/i.test(shellText);
      if (isCd && result.exitCode === 0 && adapter.sendWithKeyboard) {
        await adapter.sendWithKeyboard(msg.from, resultText, NAV_KEYBOARD);
      } else {
        await adapter.sendText(msg.from, resultText);
      }
    } catch (err) {
      await adapter.sendText(msg.from, `❌ Error: ${(err as Error).message}`);
    }
  }

  // ── Interactive mode helpers ───────────────────────────────────────────────

  private async handleInteractiveInput(
    text: string,
    operatorId: string,
    from: string,
    adapter: IMessengerAdapter,
  ): Promise<void> {
    const proc = this.sessionMgr.getInteractive(operatorId);

    if (text === '!exit' || text === '/exit' || text.toLowerCase() === 'exit') {
      await this.exitInteractiveMode(operatorId, from, adapter);
      return;
    }

    // Text-based control signal shortcuts
    if (text === '!c' || text === '/ctrlc') { proc?.writeRaw('\x03'); return; }
    if (text === '!d' || text === '/ctrld') { proc?.writeRaw('\x04'); return; }
    if (text === '/esc')   { proc?.writeRaw('\x1b'); return; }
    if (text === '/enter') { proc?.writeLine('');    return; }

    proc?.writeLine(text);
  }

  private async startInteractiveMode(
    operatorId: string,
    cmd: string,
    from: string,
    adapter: IMessengerAdapter,
  ): Promise<void> {
    const shell = this.sessionMgr.get(operatorId);
    const cwd = shell.cwd;
    const header = `🔀 \`${cmd}\` | 📂 \`${cwd}\``;

    // Send initial frame (Telegram) or simple text (WhatsApp / others)
    let usingLiveFrame = false;
    if (adapter.sendWithKeyboard) {
      try {
        const handle = await adapter.sendWithKeyboard(
          from,
          `${header}\n_Iniciando proceso..._`,
          CONTROL_KEYBOARD,
        );
        this.liveFrames.set(operatorId, {
          messageId: handle.messageId,
          header,
          content: '',
          timer: null,
        });
        usingLiveFrame = true;
      } catch (err) {
        console.error('[Interactive] sendWithKeyboard failed:', err);
      }
    }

    if (!usingLiveFrame) {
      await adapter.sendText(
        from,
        `🔀 *Modo interactivo:* \`${cmd}\`\n` +
        `Tus mensajes van directo al proceso.\n` +
        `Escribe \`!exit\` o \`/exit\` para terminar.`,
      );
    }

    // PtyProcess delivers full VirtualScreen snapshots (not raw chunks).
    // For Telegram we replace frame.content on each snapshot.
    // For WhatsApp we keep only the latest snapshot and send it debounced.
    let waSnapshot = '';
    let waTimer: NodeJS.Timeout | null = null;

    const proc = this.sessionMgr.startInteractive(operatorId, cmd, cwd, (snapshot) => {
      this.onOutput?.(operatorId, snapshot);

      const frame = this.liveFrames.get(operatorId);
      if (frame) {
        // Telegram: REPLACE content with the current rendered screen state
        frame.content = snapshot;
        if (frame.timer) clearTimeout(frame.timer);
        frame.timer = setTimeout(() => {
          const frameText = buildFrameText(frame.header, frame.content, null);
          adapter.editMessage?.(from, frame.messageId, frameText, CONTROL_KEYBOARD).catch(() => {});
        }, 500);
      } else if (!usingLiveFrame) {
        // WhatsApp / fallback: keep latest snapshot, send debounced
        waSnapshot = snapshot;
        if (waTimer) clearTimeout(waTimer);
        waTimer = setTimeout(async () => {
          if (waSnapshot.trim()) {
            await adapter.sendText(from, '```\n' + truncate(waSnapshot.trim()) + '\n```').catch(() => {});
          }
        }, 800);
      }
    });

    proc.on('exit', async (code: number) => {
      // If the user manually triggered exit, the exit event is a side-effect of kill()
      // — don't double-send messaging.
      if (this.killedByUser.has(operatorId)) {
        this.killedByUser.delete(operatorId);
        return;
      }

      // Drain any pending WA snapshot
      if (waTimer) clearTimeout(waTimer);
      if (waSnapshot.trim() && !usingLiveFrame) {
        await adapter.sendText(from, '```\n' + truncate(waSnapshot.trim()) + '\n```').catch(() => {});
      }

      const frame = this.liveFrames.get(operatorId);
      if (frame) {
        if (frame.timer) clearTimeout(frame.timer);
        this.liveFrames.delete(operatorId);
        const finalText = buildFrameText(frame.header, frame.content, `✅ Proceso terminado · exit ${code}`);
        await adapter.editMessage?.(from, frame.messageId, finalText).catch(() => {});
      } else {
        await adapter.sendText(from, `✅ Proceso terminado · exit ${code}`).catch(() => {});
      }
    });
  }

  private async exitInteractiveMode(
    operatorId: string,
    from: string,
    adapter: IMessengerAdapter,
  ): Promise<void> {
    // Mark as user-killed so the proc exit handler doesn't double-send
    this.killedByUser.add(operatorId);

    const frame = this.liveFrames.get(operatorId);
    this.sessionMgr.killInteractive(operatorId);

    if (frame) {
      if (frame.timer) clearTimeout(frame.timer);
      this.liveFrames.delete(operatorId);
      const finalText = buildFrameText(frame.header, frame.content, '🔴 Interrumpido por el usuario');
      await adapter.editMessage?.(from, frame.messageId, finalText).catch(() => {});
    }

    await adapter.sendText(from, '🔙 Proceso interrumpido. Shell normal restaurado.').catch(() => {});
  }

  private async handleNavCallback(
    navArg: string,
    operatorId: string,
    from: string,
    adapter: IMessengerAdapter,
  ): Promise<void> {
    const defaultCwd = process.env.DEFAULT_CWD ?? 'C:\\Users\\USER';
    let navCmd: string;

    if (navArg === '..') navCmd = 'cd ..';
    else if (navArg === 'home') navCmd = `cd "${defaultCwd}"`;
    else if (navArg === 'dir') navCmd = 'dir /b';
    else return;

    const shell = this.sessionMgr.get(operatorId);
    try {
      const result = await shell.execute(navCmd, { timeoutMs: 15_000 });
      const text = formatResult(navCmd, result.output, result.exitCode, result.cwd, result.durationMs);
      const showNav = navArg !== 'dir' && result.exitCode === 0 && adapter.sendWithKeyboard;
      if (showNav) {
        await adapter.sendWithKeyboard!(from, text, NAV_KEYBOARD);
      } else {
        await adapter.sendText(from, text);
      }
    } catch (err) {
      await adapter.sendText(from, `❌ ${(err as Error).message}`);
    }
  }
}

// ── Platform-specific help texts ───────────────────────────────────────────────

function helpText(platform: 'whatsapp' | 'telegram'): string {
  return platform === 'telegram' ? TELEGRAM_HELP : WHATSAPP_HELP;
}

const WHATSAPP_HELP = `🤖 *JARVIS* — Terminal remota vía WhatsApp

Escribe cualquier comando de Windows directamente:

\`\`\`
dir /b
cd source\\mi-proyecto
git status
git log --oneline -5
mkdir nueva-carpeta
npm run dev
gemini "explica este error"
claude "revisa este archivo"
gh copilot suggest "crea endpoint"
\`\`\`

*Comandos especiales:*
• \`/help\` · \`?\` → esta ayuda
• \`/pwd\` → directorio actual
• \`/reset\` → reiniciar shell (nuevo directorio)
• \`/status\` → sesiones activas

*Modo interactivo* (REPLs, chats AI):
• \`!node\` → Node.js REPL
• \`!python\` → Python interactivo
• \`!gemini\` → Gemini en modo chat
• \`!exit\` · \`/exit\` → salir del modo interactivo

_Tu sesión recuerda el directorio entre comandos._ 📂`;

const TELEGRAM_HELP = `🤖 *JARVIS* — Terminal remota vía Telegram

Usa el menú \`/\` o escribe directamente:

*Comandos de shell* (con o sin barra):
\`/cd source\\proyecto\` — cambiar directorio
\`/dir\` o \`dir /b\` — listar archivos
\`/git status\` — ejecutar git
\`/npm install\` — Node.js
\`/gemini "explica esto"\` — Gemini CLI
\`/claude "revisa esto"\` — Claude CLI

*Comandos JARVIS:*
/help — esta ayuda
/pwd — directorio actual
/reset — reiniciar shell
/status — sesiones activas

*Modo interactivo* (REPLs y AI):
\`!node\` — Node.js REPL
\`!python\` — Python
\`!gemini\` — Gemini chat
\`!claude\` — Claude chat

En modo interactivo, botones ⌃C / ⌃D / Enter / Esc / Salir aparecen en el chat.
También puedes escribir \`!exit\` o \`/exit\` para salir.

_Tu sesión recuerda el directorio entre comandos_ 📂`;
