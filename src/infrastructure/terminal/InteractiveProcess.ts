import { spawn, execFileSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import stripAnsi from 'strip-ansi';
import { EventEmitter } from 'events';

/**
 * A directly-spawned subprocess for interactive I/O.
 *
 * Bypasses the PowerShell wrapper entirely — the process gets its own
 * stdin pipe so messages from Telegram/WhatsApp reach it directly.
 *
 * Why not reuse ShellSession: The PS wrapper runs `cmd /c <process>`
 * as a blocking call; while it's running, additional stdin writes go
 * into the wrapper's buffer, not the subprocess's stdin. This class
 * fixes that by spawning the process itself.
 */
export class InteractiveProcess extends EventEmitter {
  private proc: ChildProcess;
  private _alive = true;

  constructor(
    command: string,
    cwd: string,
    private readonly onData: (chunk: string) => void,
  ) {
    super();

    this.proc = spawn('cmd.exe', ['/c', command], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env } as NodeJS.ProcessEnv,
    });

    const handle = (data: Buffer) => {
      const raw = data.toString('utf8');
      // Strip ANSI codes, collapse excessive blank lines
      const clean = stripAnsi(raw)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
      if (clean.trim()) this.onData(clean);
    };

    this.proc.stdout?.on('data', handle);
    this.proc.stderr?.on('data', handle);

    this.proc.on('error', (err) => {
      this._alive = false;
      this.onData(`\n[Error al iniciar proceso: ${err.message}]`);
      this.emit('exit', 1);
    });

    this.proc.on('exit', (code) => {
      this._alive = false;
      this.emit('exit', code ?? 0);
    });
  }

  /** Send a line of text to the process stdin */
  writeLine(text: string): void {
    if (!this._alive) return;
    this.proc.stdin?.write(text + '\r\n');
  }

  /** Send raw bytes — for control sequences (Ctrl+C, Esc, arrows) */
  writeRaw(bytes: string | Buffer): void {
    if (!this._alive) return;
    this.proc.stdin?.write(bytes);
  }

  /**
   * Kill the process and its entire child tree.
   * On Windows, SIGTERM is ignored by most processes — taskkill /F /T is reliable.
   */
  kill(): void {
    if (!this._alive) return;
    this._alive = false;
    const pid = this.proc.pid;
    if (pid) {
      try {
        execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
        return;
      } catch { /* fallthrough */ }
    }
    try { this.proc.kill(); } catch { /* ignore */ }
  }

  get isAlive(): boolean { return this._alive; }
  get pid(): number | undefined { return this.proc.pid; }
}
