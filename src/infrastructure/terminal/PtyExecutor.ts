import * as pty from 'node-pty';
import stripAnsi from 'strip-ansi';
import type { ITerminalExecutor, ExecuteOptions, ExecuteResult } from '../../domain/ports/ITerminalExecutor.js';

export class PtyExecutor implements ITerminalExecutor {
  async execute(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
    const chunks: string[] = [];
    return this.executeStream(command, (chunk) => chunks.push(chunk), options);
  }

  executeStream(
    command: string,
    onData: (chunk: string) => void,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    return new Promise((resolve) => {
      const start = Date.now();
      const { cwd, timeoutMs, env } = options;

      const proc = pty.spawn('cmd.exe', ['/c', command], {
        name: 'xterm-256color',
        cols: 220,
        rows: 50,
        cwd: cwd ?? process.env.DEFAULT_CWD ?? process.cwd(),
        env: { ...process.env, ...(env ?? {}) } as Record<string, string>,
      });

      const chunks: string[] = [];

      proc.onData((data: string) => {
        const text = stripAnsi(data);
        chunks.push(text);
        onData(text);
      });

      let timedOut = false;
      const timer = timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            proc.kill();
          }, timeoutMs)
        : null;

      proc.onExit(({ exitCode }) => {
        if (timer) clearTimeout(timer);
        const output = chunks.join('');
        resolve({
          output: timedOut ? output + '\n[Timeout: proceso terminado]' : output,
          exitCode: exitCode ?? 0,
          durationMs: Date.now() - start,
        });
      });
    });
  }
}
