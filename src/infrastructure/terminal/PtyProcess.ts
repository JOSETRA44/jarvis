import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { VirtualScreen } from './VirtualScreen.js';

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

/**
 * PTY-based subprocess for interactive I/O.
 *
 * Uses node-pty (ConPTY on Windows) so child processes see isTTY=true,
 * allowing chat CLIs (gemini, claude, qwen, node REPL, python) to enter
 * interactive mode instead of printing --help and exiting.
 *
 * The PTY output is fed through a VirtualScreen (VT100 emulator) so that
 * ANSI sequences, cursor movement and screen clears are properly rendered.
 * The `onData` callback receives full screen snapshots (not raw chunks),
 * making it easy to replace the Telegram live frame on each update.
 *
 * Why not reuse ShellSession: ShellSession uses a PowerShell wrapper with
 * pipes (isTTY=false). This class bypasses that entirely, giving the child
 * its own ConPTY so it detects a real terminal.
 */
export class PtyProcess extends EventEmitter {
  private proc: pty.IPty;
  private _alive = true;
  private screen: VirtualScreen;
  private lastSnapshot = '';

  constructor(
    command: string,
    cwd: string,
    private readonly onData: (snapshot: string) => void,
    cols = DEFAULT_COLS,
    rows = DEFAULT_ROWS,
  ) {
    super();
    this.screen = new VirtualScreen(rows, cols);

    // Route through cmd.exe so .cmd wrappers (npm-installed CLIs on Windows)
    // are resolved correctly. /Q suppresses command echo. /D skips AutoRun.
    // Prepend chcp 65001 to ensure UTF-8 output regardless of system locale.
    const cmdLine = `chcp 65001 > nul 2>&1 & ${command}`;

    this.proc = pty.spawn('cmd.exe', ['/Q', '/D', '/c', cmdLine], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...(process.env as Record<string, string>),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        // Ensure Python-based CLIs use UTF-8
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
    });

    this.proc.onData((data: string) => {
      this.screen.write(data);
      const snapshot = this.screen.renderActiveRegion();
      // Only call onData when the visible content actually changed.
      // PTY fires many data events for cursor blinks, mode changes, etc.
      if (snapshot !== this.lastSnapshot) {
        this.lastSnapshot = snapshot;
        this.onData(snapshot);
      }
    });

    this.proc.onExit(({ exitCode }) => {
      this._alive = false;
      this.emit('exit', exitCode ?? 0);
    });
  }

  /** Send a line of text to the process (appends \r which is Enter in PTY) */
  writeLine(text: string): void {
    if (!this._alive) return;
    this.proc.write(text + '\r');
  }

  /**
   * Send raw bytes — for control sequences:
   * - Ctrl+C: '\x03'
   * - Ctrl+D: '\x04'
   * - Escape:  '\x1b'
   * - Arrow keys: '\x1b[A' (up), '\x1b[B' (down), etc.
   */
  writeRaw(bytes: string): void {
    if (!this._alive) return;
    this.proc.write(bytes);
  }

  /** Resize the PTY (e.g., to adjust live frame width) */
  resize(cols: number, rows: number): void {
    if (!this._alive) return;
    try { this.proc.resize(cols, rows); } catch {}
    this.screen = new VirtualScreen(rows, cols);
    this.lastSnapshot = '';
  }

  kill(): void {
    if (!this._alive) return;
    this._alive = false;
    try { this.proc.kill(); } catch {}
  }

  /** Current rendered screen content */
  snapshot(): string {
    return this.screen.renderActiveRegion();
  }

  get isAlive(): boolean { return this._alive; }
  get pid(): number { return this.proc.pid; }
}
