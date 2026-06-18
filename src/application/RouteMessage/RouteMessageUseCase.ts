import type { IncomingMessage } from '../../domain/ports/IMessengerAdapter.js';
import type { IMessengerAdapter } from '../../domain/ports/IMessengerAdapter.js';
import type { AuthorizeOperatorUseCase } from '../AuthorizeOperator/AuthorizeOperatorUseCase.js';
import type { ExecuteCommandUseCase } from '../ExecuteCommand/ExecuteCommandUseCase.js';
import type { ISessionRepository } from '../../domain/ports/ISessionRepository.js';
import type { RateLimiter } from '../../infrastructure/security/RateLimiter.js';
import type { OperatingMode } from '../../infrastructure/config/ModeManager.js';

const ALLOWED_AI_PREFIXES = ['gemini', 'gh copilot', 'copilot'];

function isAiCommand(cmd: string): boolean {
  const lower = cmd.toLowerCase().trim();
  return ALLOWED_AI_PREFIXES.some((p) => lower.startsWith(p));
}

export class RouteMessageUseCase {
  constructor(
    private authorizeUC: AuthorizeOperatorUseCase,
    private executeUC: ExecuteCommandUseCase,
    private sessionRepo: ISessionRepository,
    private rateLimiter: RateLimiter,
    private getMode: () => OperatingMode,
    private onOutput?: (operatorId: string, chunk: string) => void
  ) {}

  async handle(msg: IncomingMessage, adapter: IMessengerAdapter): Promise<void> {
    const text = msg.text.trim();

    const operator = await this.authorizeUC.execute(msg.platform, msg.from);
    if (!operator) {
      await adapter.sendText(msg.from, '⛔ No estás autorizado para usar JARVIS.');
      return;
    }

    if (this.rateLimiter.isLimited(operator.id)) {
      await adapter.sendText(msg.from, '⏳ Límite de comandos alcanzado. Espera un momento.');
      return;
    }
    this.rateLimiter.record(operator.id);

    const mode = this.getMode();

    if (mode === 'ai' && !isAiCommand(text)) {
      await adapter.sendText(
        msg.from,
        `⚠️ Modo AI activo: solo se permiten comandos de Gemini/Copilot.\nEj: \`gemini ¿qué es Node.js?\``
      );
      return;
    }

    let session = await this.sessionRepo.findActiveByOperator(operator.id);
    if (!session) {
      session = await this.sessionRepo.create({
        operatorId: operator.id,
        platform: msg.platform,
        pid: null,
        cwd: process.env.DEFAULT_CWD ?? process.cwd(),
        status: 'active',
      });
    }

    await adapter.sendText(msg.from, '⚙️ Ejecutando...');

    const chunks: string[] = [];
    try {
      const result = await this.executeUC.execute({
        operator,
        sessionId: session.id,
        command: text,
        onChunk: (chunk) => {
          chunks.push(chunk);
          this.onOutput?.(operator.id, chunk);
        },
      });

      const output = result.output.trim() || '(sin output)';
      const status = result.exitCode === 0 ? '✅' : '❌';
      const response = `${status} \`${text}\`\n\`\`\`\n${output.slice(0, 3800)}\n\`\`\`\n⏱ ${result.durationMs}ms`;

      await adapter.sendText(msg.from, response);
    } catch (err) {
      await adapter.sendText(msg.from, `❌ Error al ejecutar: ${(err as Error).message}`);
    }
  }
}
