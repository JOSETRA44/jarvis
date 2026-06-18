import { ShellSession } from './ShellSession.js';

/**
 * One persistent ShellSession per operator.
 * Sessions are created on first use and kept alive indefinitely.
 * Operators can kill their session to start fresh.
 */
export class SessionManager {
  private sessions = new Map<string, ShellSession>();
  private defaultCwd: string;

  constructor(defaultCwd: string) {
    this.defaultCwd = defaultCwd;
  }

  get(operatorId: string): ShellSession {
    let session = this.sessions.get(operatorId);
    if (!session || !session.isAlive) {
      session = new ShellSession(this.defaultCwd);
      session.on('exit', () => {
        // Auto-remove dead sessions
        if (this.sessions.get(operatorId) === session) {
          this.sessions.delete(operatorId);
        }
      });
      this.sessions.set(operatorId, session);
    }
    return session;
  }

  kill(operatorId: string): boolean {
    const session = this.sessions.get(operatorId);
    if (!session) return false;
    session.kill();
    this.sessions.delete(operatorId);
    return true;
  }

  killAll() {
    for (const session of this.sessions.values()) {
      try { session.kill(); } catch {}
    }
    this.sessions.clear();
  }

  getActiveSessions(): Array<{ operatorId: string; cwd: string; interactive: boolean }> {
    return [...this.sessions.entries()]
      .filter(([, s]) => s.isAlive)
      .map(([id, s]) => ({ operatorId: id, cwd: s.cwd, interactive: s.interactiveMode }));
  }
}
