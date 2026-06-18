import { spawn, ChildProcess } from 'child_process';
import stripAnsi from 'strip-ansi';
import { EventEmitter } from 'events';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface ShellResult {
  output: string;
  exitCode: number;
  cwd: string;
  durationMs: number;
}

interface Pending {
  resolve: (r: ShellResult) => void;
  onChunk?: (chunk: string) => void;
  timer: NodeJS.Timeout;
  startedAt: number;
}

// Unique marker that won't appear in normal command output
const END_MARKER = '__JARVIS_SHELL_END__';

// PowerShell wrapper: reads commands from stdin one at a time, executes them,
// outputs a clean END_MARKER so there's no prompt echo, no command echo.
//
// All commands route through `cmd /c` for full Windows compatibility (dir /b,
// echo with spaces, git, gemini, etc.). `cd` is handled separately via
// Set-Location so that the working directory persists in the PS session.
const WRAPPER_SCRIPT = `
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
Write-Output '__JARVIS_SHELL_READY__'
while ($true) {
    $__l = [Console]::ReadLine()
    if ($null -eq $__l) { break }
    if ($__l -match '^\\s*(?:cd|chdir)\\s+(.+)$') {
        $__p = $matches[1].Trim().Trim('"').Trim("'")
        try { Set-Location $__p } catch { Write-Output "cd: $($_.Exception.Message)" }
        $__e = if ($?) { 0 } else { 1 }
    } elseif ($__l -match '^\\s*(?:cd|chdir)\\s*$') {
        Set-Location $HOME
        $__e = 0
    } else {
        cmd.exe /c "chcp 65001 > nul 2>&1 & $__l" 2>&1 | ForEach-Object { Write-Output "$_" }
        $__e = $LASTEXITCODE
    }
    Write-Output '__JARVIS_SHELL_END__'
    Write-Output $__e
    Write-Output (Get-Location).Path
}
`.trim();

/**
 * Persistent PowerShell session per operator — SSH-like stateful shell.
 *
 * Spawns a PowerShell wrapper script in -NonInteractive mode so that:
 * - Commands are NOT echoed (no prompt, no command echo)
 * - CWD persists across commands (cd, Set-Location)
 * - All CLIs work (git, gemini, claude, gh, node, etc.)
 * - Exit codes are accurately captured
 */
export class ShellSession extends EventEmitter {
  private proc: ChildProcess;
  private rawBuffer = '';
  private pending: Pending | null = null;
  private _cwd: string;
  private alive = true;
  private ready = false;
  private wrapperPath: string;

  interactiveMode = false;
  private interactiveOnData?: (chunk: string) => void;

  constructor(cwd: string) {
    super();
    this._cwd = cwd;

    // Write wrapper script to temp file
    this.wrapperPath = join(tmpdir(), `jarvis_shell_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
    writeFileSync(this.wrapperPath, WRAPPER_SCRIPT, 'utf8');

    this.proc = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-File', this.wrapperPath,
    ], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env } as NodeJS.ProcessEnv,
    });

    const handleData = (data: Buffer) => {
      const raw = data.toString('utf8');

      if (this.interactiveMode && this.interactiveOnData) {
        this.interactiveOnData(stripAnsi(raw));
        return;
      }

      this.rawBuffer += raw;

      if (!this.ready) {
        if (this.rawBuffer.includes('__JARVIS_SHELL_READY__')) {
          this.ready = true;
          this.rawBuffer = '';
        }
        return;
      }

      if (!this.pending) return;

      const stripped = stripAnsi(raw);
      if (stripped.trim() && !stripped.includes(END_MARKER)) {
        this.pending.onChunk?.(stripped);
      }

      // Wait until we have END_MARKER + exit code line + cwd line
      if (this.rawBuffer.includes(END_MARKER)) {
        const markerIdx = this.rawBuffer.indexOf(END_MARKER);
        const after = this.rawBuffer.slice(markerIdx + END_MARKER.length);
        const afterLines = after.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (afterLines.length >= 2) {
          this.finishPending();
        }
      }
    };

    this.proc.stdout!.on('data', handleData);
    this.proc.stderr!.on('data', handleData);

    this.proc.on('exit', (code) => {
      this.alive = false;
      this.cleanup();
      this.emit('exit', code);
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        clearTimeout(p.timer);
        p.resolve({
          output: stripAnsi(this.rawBuffer).trim() || '[Shell cerrado]',
          exitCode: code ?? 1,
          cwd: this._cwd,
          durationMs: Date.now() - p.startedAt,
        });
      }
    });
  }

  private finishPending() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);

    const buf = stripAnsi(this.rawBuffer);
    this.rawBuffer = '';

    const markerIdx = buf.indexOf(END_MARKER);
    const commandOut = markerIdx >= 0 ? buf.slice(0, markerIdx) : buf;
    const after = markerIdx >= 0 ? buf.slice(markerIdx + END_MARKER.length) : '';

    const afterLines = after.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const exitCode = parseInt(afterLines[0] ?? '0') || 0;
    const newCwd = afterLines[1] ?? '';
    if (newCwd.match(/^[A-Za-z]:\\/)) {
      this._cwd = newCwd;
    }

    p.resolve({
      output: commandOut.trim(),
      exitCode,
      cwd: this._cwd,
      durationMs: Date.now() - p.startedAt,
    });
  }

  execute(
    command: string,
    opts: { timeoutMs?: number; onChunk?: (chunk: string) => void } = {}
  ): Promise<ShellResult> {
    return new Promise((resolve, reject) => {
      if (!this.alive) {
        reject(new Error('Shell session cerrada'));
        return;
      }

      const attempt = () => {
        if (!this.ready) { setTimeout(attempt, 150); return; }
        if (this.pending) { setTimeout(attempt, 200); return; }

        this.rawBuffer = '';

        const timer = setTimeout(() => {
          if (this.pending) {
            const out = stripAnsi(this.rawBuffer).trim();
            this.pending = null;
            this.rawBuffer = '';
            resolve({
              output: out + '\n⏱ [Timeout — proceso puede seguir corriendo]',
              exitCode: 124,
              cwd: this._cwd,
              durationMs: opts.timeoutMs ?? 60_000,
            });
          }
        }, opts.timeoutMs ?? 60_000);

        this.pending = { resolve, onChunk: opts.onChunk, timer, startedAt: Date.now() };

        // Send single-line command to wrapper's ReadLine()
        this.proc.stdin!.write(command + '\n');
      };

      attempt();
    });
  }

  enterInteractive(onData: (chunk: string) => void) {
    this.interactiveMode = true;
    this.interactiveOnData = onData;
    this.rawBuffer = '';
  }

  exitInteractive() {
    this.interactiveMode = false;
    this.interactiveOnData = undefined;
    this.proc.stdin!.write('\x03');
    this.rawBuffer = '';
  }

  sendRaw(input: string) {
    if (!this.alive) return;
    this.proc.stdin!.write(input + '\n');
  }

  private cleanup() {
    try { unlinkSync(this.wrapperPath); } catch {}
  }

  get cwd(): string { return this._cwd; }
  get isAlive(): boolean { return this.alive; }

  kill() {
    this.alive = false;
    this.cleanup();
    try { this.proc.kill('SIGTERM'); } catch {}
  }
}
