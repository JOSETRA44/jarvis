import { ShellSession } from './ShellSession.js';
import { PtyProcess } from './PtyProcess.js';
import { PtyTerminalSession } from './PtyTerminalSession.js';

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

  // Mobile app sessions keyed by deviceId (stable across reconnects) →
  // { sessionId → PtyTerminalSession }. Falls back to ephemeral connId when no
  // deviceId is present (ALLOWED_DEVICE_IDS unset) — then there's no persistence.
  private mobileConns = new Map<string, Map<string, PtyTerminalSession>>();
  // Active session per device (for fallback routing when session id omitted)
  private mobileActive = new Map<string, string>();
  // Grace-period timers: a detached device's sessions are killed only if it
  // does not re-attach before DETACH_GRACE_MS elapses.
  private detachTimers = new Map<string, NodeJS.Timeout>();
  private static readonly DETACH_GRACE_MS = 180_000;

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

    for (const conn of this.mobileConns.values()) {
      for (const sess of conn.values()) {
        try { sess.kill(); } catch { /* ignore */ }
      }
    }
    this.mobileConns.clear();
    this.mobileActive.clear();

    for (const timer of this.detachTimers.values()) clearTimeout(timer);
    this.detachTimers.clear();
  }

  // ── Mobile PTY sessions (per-device tabs, persistent across reconnects) ──

  createMobileSession(deviceId: string, cwd?: string): PtyTerminalSession {
    this._cancelDetach(deviceId);
    let conn = this.mobileConns.get(deviceId);
    if (!conn) {
      conn = new Map();
      this.mobileConns.set(deviceId, conn);
    }
    const sess = new PtyTerminalSession(cwd ?? this.defaultCwd);
    conn.set(sess.sessionId, sess);
    this.mobileActive.set(deviceId, sess.sessionId);

    sess.on('exit', () => {
      conn!.delete(sess.sessionId);
      // Promote another session if this was the active one
      if (this.mobileActive.get(deviceId) === sess.sessionId) {
        const remaining = [...conn!.keys()];
        if (remaining.length > 0) {
          this.mobileActive.set(deviceId, remaining[remaining.length - 1]!);
        } else {
          this.mobileActive.delete(deviceId);
        }
      }
    });
    return sess;
  }

  getMobileSession(deviceId: string, sessionId: string): PtyTerminalSession | undefined {
    return this.mobileConns.get(deviceId)?.get(sessionId);
  }

  getActiveMobileSession(deviceId: string): PtyTerminalSession | undefined {
    const activeId = this.mobileActive.get(deviceId);
    if (!activeId) return undefined;
    return this.mobileConns.get(deviceId)?.get(activeId);
  }

  setActiveMobileSession(deviceId: string, sessionId: string): void {
    this.mobileActive.set(deviceId, sessionId);
  }

  closeMobileSession(deviceId: string, sessionId: string): void {
    const conn = this.mobileConns.get(deviceId);
    if (!conn) return;
    const sess = conn.get(sessionId);
    if (sess) { sess.kill(); conn.delete(sessionId); }
    if (this.mobileActive.get(deviceId) === sessionId) {
      const remaining = [...conn.keys()];
      if (remaining.length > 0) {
        this.mobileActive.set(deviceId, remaining[remaining.length - 1]!);
      } else {
        this.mobileActive.delete(deviceId);
      }
    }
  }

  closeAllMobileSessions(deviceId: string): void {
    this._cancelDetach(deviceId);
    const conn = this.mobileConns.get(deviceId);
    if (conn) {
      for (const sess of conn.values()) try { sess.kill(); } catch { /* ignore */ }
      conn.clear();
    }
    this.mobileConns.delete(deviceId);
    this.mobileActive.delete(deviceId);
  }

  // ── Detach / re-attach (background-drop resilience) ──────────────────

  /** True if the device has at least one live session to re-attach to. */
  hasLiveSessions(deviceId: string): boolean {
    const conn = this.mobileConns.get(deviceId);
    return !!conn && conn.size > 0;
  }

  /** All live sessions for a device, in insertion order. */
  listMobileSessions(deviceId: string): PtyTerminalSession[] {
    const conn = this.mobileConns.get(deviceId);
    return conn ? [...conn.values()] : [];
  }

  /**
   * Mark a device as detached (its WebSocket dropped). Sessions are kept alive
   * for DETACH_GRACE_MS so a quick reconnect re-attaches them; if the grace
   * expires without re-attach, they're killed.
   */
  detachDevice(deviceId: string): void {
    if (!this.hasLiveSessions(deviceId)) return;
    this._cancelDetach(deviceId);
    const timer = setTimeout(() => {
      this.detachTimers.delete(deviceId);
      this.closeAllMobileSessions(deviceId);
    }, SessionManager.DETACH_GRACE_MS);
    // Don't keep the event loop alive solely for this timer.
    if (typeof timer.unref === 'function') timer.unref();
    this.detachTimers.set(deviceId, timer);
  }

  /** Cancel a pending detach grace timer (device re-attached). */
  reattachDevice(deviceId: string): PtyTerminalSession[] {
    this._cancelDetach(deviceId);
    return this.listMobileSessions(deviceId);
  }

  private _cancelDetach(deviceId: string): void {
    const timer = this.detachTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.detachTimers.delete(deviceId);
    }
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
