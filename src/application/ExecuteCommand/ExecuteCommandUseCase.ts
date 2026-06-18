import type { ITerminalExecutor } from '../../domain/ports/ITerminalExecutor.js';
import type { ICommandRepository } from '../../domain/ports/ICommandRepository.js';
import type { ISessionRepository } from '../../domain/ports/ISessionRepository.js';
import type { Operator } from '../../domain/entities/Operator.js';

export interface ExecuteCommandInput {
  operator: Operator;
  sessionId: string;
  command: string;
  cwd?: string;
  onChunk?: (chunk: string) => void;
}

export interface ExecuteCommandOutput {
  output: string;
  exitCode: number;
  durationMs: number;
  commandId: string;
}

export class ExecuteCommandUseCase {
  constructor(
    private executor: ITerminalExecutor,
    private commandRepo: ICommandRepository,
    private sessionRepo: ISessionRepository,
    private timeoutMs: number
  ) {}

  async execute(input: ExecuteCommandInput): Promise<ExecuteCommandOutput> {
    const session = await this.sessionRepo.findById(input.sessionId);
    const cwd = input.cwd ?? session?.cwd ?? process.cwd();

    const result = await this.executor.executeStream(
      input.command,
      input.onChunk ?? (() => {}),
      { cwd, timeoutMs: this.timeoutMs }
    );

    const saved = await this.commandRepo.create({
      sessionId: input.sessionId,
      operatorId: input.operator.id,
      input: input.command,
      output: result.output,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    });

    await this.sessionRepo.update(input.sessionId, { status: 'idle' });

    return {
      output: result.output,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      commandId: saved.id,
    };
  }
}
