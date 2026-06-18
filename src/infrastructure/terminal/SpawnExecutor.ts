import { spawn } from 'child_process';
import stripAnsi from 'strip-ansi';
import type { ITerminalExecutor, ExecuteOptions, ExecuteResult } from '../../domain/ports/ITerminalExecutor.js';

export class SpawnExecutor implements ITerminalExecutor {
  async execute(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
    const chunks: string[] = [];
    const result = await this.executeStream(command, (chunk) => chunks.push(chunk), options);
    return result;
  }

  executeStream(
    command: string,
    onData: (chunk: string) => void,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const { cwd, timeoutMs, env } = options;

      const proc = spawn('cmd.exe', ['/c', command], {
        cwd: cwd ?? process.env.DEFAULT_CWD ?? process.cwd(),
        env: { ...process.env, ...(env ?? {}) },
        windowsHide: true,
      });

      const chunks: string[] = [];

      proc.stdout.on('data', (data: Buffer) => {
        const text = stripAnsi(data.toString('utf8'));
        chunks.push(text);
        onData(text);
      });

      proc.stderr.on('data', (data: Buffer) => {
        const text = stripAnsi(data.toString('utf8'));
        chunks.push(text);
        onData(text);
      });

      let timedOut = false;
      const timer = timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            proc.kill('SIGTERM');
          }, timeoutMs)
        : null;

      proc.on('close', (code) => {
        if (timer) clearTimeout(timer);
        const output = chunks.join('');
        resolve({
          output: timedOut ? output + '\n[Timeout: comando terminado]' : output,
          exitCode: code ?? 1,
          durationMs: Date.now() - start,
        });
      });

      proc.on('error', reject);
    });
  }
}
