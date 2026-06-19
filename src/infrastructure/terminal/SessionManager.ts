import { ShellSession } from './ShellSession.js';
import { PtyProcess } from './PtyProcess.js';

/**
 * One persistent ShellSession per operator (for stateful non-interactive commands)
 * plus one optional PtyProcess per operator (for REPLs, AI CLIs, TUI apps).
 *
 * - ShellSession (PS wrapper): great for cd/dir/git with CWD persistence, isTTY not required
 * - PtyProcess (ConPTY): spawns with a real PTY so tools like gemini/claude/qwen
 *   see isTTY=true and enter interactive/chat mode
 */
export class SessionManager {
  private sessions = new Map<string, ShellSession>();
  private interactive = new Map<string, PtyProcess>();
  private defaultCwd: string;

  constructor(defaultCwd: string) {
    this.defaultCwd = defaultCwd;
  }

  // ── Shell sessions (stateful CWD) ────────────────────────────────

  get(operatorId: string): ShellSession {
    let session = this.sessions.get(operatorId);
    if (!session || !session.isAlive) {
      session = new ShellSession(this.defaultCwd);
      session.on('exit', () => {
        if (this.sessions.get(operatorId) === session) {
          this.sessions.delete(operatorId);
        }
      });
      this.sessions.set(operatorId, session);
    }
    return session;
  }

  // ── PTY interactive processes ────────────────────────────────────

  hasInteractive(operatorId: string): boolean {
    const p = this.interactive.get(operatorId);
    return p != null && p.isAlive;
  }

  getInteractive(operatorId: string): PtyProcess | undefined {
    const p = this.interactive.get(operatorId);
    return p?.isAlive ? p : undefined;
  }

  startInteractive(
    operatorId: string,
    command: string,
    cwd: string,
    onData: (snapshot: string) => void,
  ): PtyProcess {
    this.killInteractive(operatorId);

    const proc = new PtyProcess(command, cwd, onData);

    proc.on('exit', () => {
      if (this.interactive.get(operatorId) === proc) {
        this.interactive.delete(operatorId);
      }
    });

    this.interactive.set(operatorId, proc);
    return proc;
  }

  killInteractive(operatorId: string): boolean {
    const proc = this.interactive.get(operatorId);
    if (!proc) return false;
    proc.kill();
    this.interactive.delete(operatorId);
    return true;
  }

  kill(operatorId: string): boolean {
    this.killInteractive(operatorId);
    const session = this.sessions.get(operatorId);
    if (!session) return false;
    session.kill();
    this.sessions.delete(operatorId);
    return true;
  }

  killAll() {
    for (const p of this.interactive.values()) {
      try { p.kill(); } catch { /* ignore */ }
    }
    this.interactive.clear();

    for (const s of this.sessions.values()) {
      try { s.kill(); } catch { /* ignore */ }
    }
    this.sessions.clear();
  }

  getActiveSessions(): Array<{ operatorId: string; cwd: string; interactive: boolean }> {
    return [...this.sessions.entries()]
      .filter(([, s]) => s.isAlive)
      .map(([id, s]) => ({
        operatorId: id,
        cwd: s.cwd,
        interactive: this.hasInteractive(id),
      }));
  }
}
