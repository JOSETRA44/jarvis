import type { IncomingMessage, IMessengerAdapter } from '../../domain/ports/IMessengerAdapter.js';
import type { AuthorizeOperatorUseCase } from '../AuthorizeOperator/AuthorizeOperatorUseCase.js';
import type { ICommandRepository } from '../../domain/ports/ICommandRepository.js';
import type { SessionManager } from '../../infrastructure/terminal/SessionManager.js';
import type { RateLimiter } from '../../infrastructure/security/RateLimiter.js';
import type { ISessionRepository } from '../../domain/ports/ISessionRepository.js';

const MAX_MSG_CHARS = 3800;

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

/**
 * Strip a leading / or \ from commands that are NOT JARVIS built-ins.
 *
 * Telegram users naturally type /cd source, /dir, /git status because the /
 * prefix triggers the bot command menu. WhatsApp users sometimes type \cd too.
 * Built-in JARVIS commands (/help, /pwd, /reset, /status) are handled before
 * this function is ever called and are never normalized.
 */
function normalizeShellCommand(text: string): string {
  if ((text.startsWith('/') || text.startsWith('\\')) && text.length > 1) {
    return text.slice(1).trimStart();
  }
  return text;
}

export class RouteMessageUseCase {
  constructor(
    private authorizeUC: AuthorizeOperatorUseCase,
    private sessionMgr: SessionManager,
    private commandRepo: ICommandRepository,
    private sessionRepo: ISessionRepository,
    private rateLimiter: RateLimiter,
    private onOutput?: (operatorId: string, chunk: string) => void
  ) {}

  async handle(msg: IncomingMessage, adapter: IMessengerAdapter): Promise<void> {
    const text = msg.text.trim();
    if (!text) return;

    // ── Authorization ──────────────────────────────────────────────
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

    const shell = this.sessionMgr.get(operator.id);

    // ── Interactive passthrough mode ───────────────────────────────
    if (shell.interactiveMode) {
      if (text === '!exit' || text === '/exit' || text.toLowerCase() === 'exit') {
        shell.exitInteractive();
        await adapter.sendText(msg.from, '🔙 Saliste del modo interactivo. Shell normal restaurado.');
        return;
      }
      shell.sendRaw(text);
      return;
    }

    // ── Built-in JARVIS commands ────────────────────────────────────
    // These are checked BEFORE normalization so /help, /pwd etc. keep working.
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

    // ── Normalize: strip leading / or \ before reaching the shell ──
    // After this point, /cd source → cd source, \git status → git status, etc.
    const shellText = normalizeShellCommand(text);

    // ── Interactive mode trigger: ! prefix ─────────────────────────
    if (shellText.startsWith('!') && shellText.length > 1) {
      const cmd = shellText.slice(1).trim();
      await adapter.sendText(
        msg.from,
        `🔀 *Modo interactivo:* \`${cmd}\`\n` +
        `Tus próximos mensajes van directo al proceso.\n` +
        `Escribe \`!exit\` o \`/exit\` para terminar.`
      );

      let outputAccum = '';
      let sendTimer: NodeJS.Timeout | null = null;

      shell.enterInteractive((chunk) => {
        outputAccum += chunk;
        this.onOutput?.(operator.id, chunk);
        if (sendTimer) clearTimeout(sendTimer);
        sendTimer = setTimeout(async () => {
          if (outputAccum.trim()) {
            await adapter.sendText(msg.from, '```\n' + truncate(outputAccum.trim()) + '\n```').catch(() => {});
            outputAccum = '';
          }
        }, 800);
      });

      shell.sendRaw(cmd);
      return;
    }

    // ── Rate limiting ──────────────────────────────────────────────
    if (this.rateLimiter.isLimited(operator.id)) {
      await adapter.sendText(msg.from, '⏳ Demasiados comandos. Espera un momento.');
      return;
    }
    this.rateLimiter.record(operator.id);

    // ── Execute in persistent shell ────────────────────────────────
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

      await adapter.sendText(msg.from, formatResult(shellText, result.output, result.exitCode, result.cwd, result.durationMs));
    } catch (err) {
      await adapter.sendText(msg.from, `❌ Error: ${(err as Error).message}`);
    }
  }
}

// ── Platform-specific help texts ───────────────────────────────────────────

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

*Modo interactivo* (REPLs):
\`!node\` — Node.js REPL
\`!python\` — Python
\`!gemini\` — Gemini chat
\`/exit\` o \`!exit\` — salir del modo

_Tu sesión recuerda el directorio entre comandos_ 📂`;
