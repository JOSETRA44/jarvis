import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

// Strip ANSI/VT100 sequences (CSI, OSC, 2-char ESC).
// Runs AFTER OSC 9001 extraction so we don't lose marker data first.
const STRIP_ANSI = /\x1b\[[\x20-\x3f]*[\x40-\x7e]|\x1b\][^\x07]*\x07|\x1b\][^\x1b]*\x1b\\|\x1b[\x20-\x2f]?[\x40-\x7e]|[\x00-\x08\x0e-\x1a\x1c-\x1f\x7f]/g;

// JARVIS shell-integration marker: ESC ] 9001 ; exitCode ; cwd BEL
const MARKER_RE = /\x1b\]9001;(-?\d+);([^\x07]*)\x07/g;

// Screen-clear sequences: erase-display (full), alternate-screen enter, cursor-home+erase.
// Detecting these lets us tell Flutter to clear the running block before the TUI redraws.
const SCREEN_CLEAR_RE = /\x1b\[2J|\x1b\[H\x1b\[2?J|\x1b\[\?1049h/;

// PowerShell initialization injected into stdin after startup.
// Sets UTF-8, installs the prompt hook, triggers first prompt.
const PS_INIT = [
  `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8`,
  `$ErrorActionPreference='Continue'`,
  `function prompt{$__e=if($global:LASTEXITCODE){$global:LASTEXITCODE}else{0};$__c=(Get-Location).Path;[Console]::Write([char]27+']9001;'+$__e+';'+$__c+[char]7);return ''}`,
  ``,  // empty line forces first prompt() call → emits first OSC 9001
].join('\r\n') + '\r\n';

/**
 * PTY session with shell integration for the JARVIS mobile app.
 *
 * Spawns an interactive PowerShell process via ConPTY (isTTY=true for all
 * child processes). The custom `prompt` function emits OSC 9001 markers so
 * the backend can detect command boundaries, exit codes, and the current CWD
 * without any special routing or `__JARVIS_SHELL_END__` sentinel logic.
 *
 * Events:
 *   'output'  (text: string)              — ANSI-stripped output chunk
 *   'prompt'  (cwd: string, exitCode: number)  — shell is ready for next cmd
 *   'exit'    (code: number)              — session process exited
 */
export class PtyTerminalSession extends EventEmitter {
  readonly sessionId: string;

  private _cwd: string;
  private _proc: pty.IPty;
  private _buf = '';
  private _ready = false;      // true after first OSC 9001 fires
  private _alive = true;
  // True when the previous output chunk ended with a bare \r (no \n).
  // This means the next output should replace the last line in the Flutter UI
  // instead of appending — handles spinner/progress-bar overwrites.
  private _lastChunkEndedWithCR = false;

  constructor(cwd: string, sessionId?: string) {
    super();
    this.sessionId = sessionId ?? randomUUID().slice(0, 8);
    this._cwd = cwd;

    this._proc = pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile'], {
      name: 'xterm-256color',
      cols: 220,
      rows: 50,
      cwd,
      env: {
        ...(process.env as Record<string, string>),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
    });

    this._proc.onData((raw) => this._onData(raw));
    this._proc.onExit(({ exitCode }) => {
      this._alive = false;
      this.emit('exit', exitCode ?? 0);
    });

    // Write init after PowerShell is bootstrapped (~250 ms).
    // The PTY buffers stdin writes so there's no race condition.
    setTimeout(() => {
      if (this._alive) this._proc.write(PS_INIT);
    }, 250);
  }

  private _onData(raw: string): void {
    this._buf += raw;
    // Hold back if there's a partial OSC sequence at the end of the buffer
    // (i.e. we've seen \x1b] but not the closing \x07 yet).
    if (/\x1b\][^\x07]*$/.test(this._buf)) return;
    this._flush();
  }

  private _flush(): void {
    const chunk = this._buf;
    this._buf = '';

    // Extract all OSC 9001 markers before stripping
    const markers: { exitCode: number; cwd: string }[] = [];
    for (const m of chunk.matchAll(MARKER_RE)) {
      markers.push({ exitCode: parseInt(m[1]!, 10), cwd: m[2]! });
    }

    if (!this._ready) {
      if (markers.length > 0) {
        this._ready = true;
        const last = markers[markers.length - 1]!;
        if (last.cwd) this._cwd = last.cwd;
        this.emit('prompt', this._cwd, 0);
      }
      return;
    }

    // ── Raw PTY output for xterm.dart rendering ───────────────────────────────
    // Send raw bytes minus JARVIS-internal OSC 9001 markers.
    // Flutter's TerminalView (xterm.dart) handles VT100/cursor movement correctly.
    const rawForClient = chunk.replace(MARKER_RE, '');
    if (rawForClient) {
      this.emit('raw_output', rawForClient);
    }

    // ── Screen-clear detection (must run on raw chunk before ANSI strip) ──────
    // When a TUI app clears the screen, tell Flutter to wipe the block output
    // so the next redraw starts clean instead of appending over old content.
    if (SCREEN_CLEAR_RE.test(chunk)) {
      this._lastChunkEndedWithCR = false;
      this.emit('clear_output');
    }

    // ── Text cleaning ─────────────────────────────────────────────────────────
    // 1. Strip ANSI/VT sequences
    let stripped = chunk.replace(STRIP_ANSI, '');

    // 2. Normalize Windows line endings (\r\n → \n) BEFORE bare-\r handling
    stripped = stripped.replace(/\r\n/g, '\n');

    // 3. Handle bare \r (carriage return without \n = "go to column 0 and
    //    overwrite"). Within a single chunk, take only the content after the
    //    last \r on each \n-terminated line so we show the final frame state.
    const clean = stripped
      .split('\n')
      .map((seg) => seg.includes('\r') ? seg.split('\r').pop()! : seg)
      .join('\n')
      .trimEnd();

    // ── Replace-last tracking ─────────────────────────────────────────────────
    // If the PREVIOUS chunk ended with a bare \r, the current output should
    // replace the last line already shown in Flutter (spinner frame update).
    const replaceLast = this._lastChunkEndedWithCR ? 1 : 0;

    // Update state for the next chunk: did this one end with a bare \r?
    this._lastChunkEndedWithCR = /\r$/.test(stripped);

    if (clean) {
      this.emit('output', clean, replaceLast);
    }

    // ── Shell-ready markers ───────────────────────────────────────────────────
    for (const { exitCode, cwd } of markers) {
      if (cwd) this._cwd = cwd;
      this._lastChunkEndedWithCR = false; // prompt reset — no pending replace
      this.emit('prompt', this._cwd, exitCode);
    }
  }

  get cwd(): string { return this._cwd; }
  get alive(): boolean { return this._alive; }

  /** Send raw bytes to the PTY stdin (keystroke, command + \r, control seq). */
  write(data: string): void {
    if (this._alive) this._proc.write(data);
  }

  /** Resize the PTY dimensions. */
  resize(cols: number, rows: number): void {
    if (!this._alive) return;
    try { this._proc.resize(cols, rows); } catch {}
  }

  kill(): void {
    if (!this._alive) return;
    this._alive = false;
    try { this._proc.kill(); } catch {}
  }
}
