import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../../infrastructure/terminal/SessionManager.js';
import type { PtyTerminalSession } from '../../infrastructure/terminal/PtyTerminalSession.js';

type Sock = { readyState: number; send: (d: string) => void; close: () => void };

function emit(s: Sock, payload: object) {
  if (s.readyState === 1) s.send(JSON.stringify(payload));
}

function shortCwd(cwd: string): string {
  return cwd.split(/[/\\]/).filter(Boolean).pop() ?? cwd;
}

/**
 * Mobile WebSocket endpoint v2 — /ws/mobile
 *
 * Protocol (all messages are JSON):
 *
 * Client → Server:
 *   { type: "auth",          token: string }
 *   { type: "ping" }
 *   { type: "input",         data: string, session?: string }  ← raw PTY bytes
 *   { type: "resize",        cols: number, rows: number, session?: string }
 *   { type: "session_new" }                                    ← open tab
 *   { type: "session_close", id: string }                      ← close tab
 *
 * Server → Client:
 *   { type: "authenticated",   connectionId, sessions: [{id, cwd, label}], reattached }
 *   { type: "session_created", id, cwd, label }
 *   { type: "session_closed",  id }                            ← user-requested close
 *   { type: "session_exit",    id, exitCode }                  ← process exited
 *   { type: "raw",             data, session, replay? }        ← raw PTY bytes
 *   { type: "output",          data, replace, session }        ← ANSI-stripped text
 *   { type: "clear_output",    session }
 *   { type: "prompt",          cwd, exitCode, session, durationMs? }
 *   { type: "pong" }
 *   { type: "error",           message }
 *
 * Sessions persist per deviceId: a dropped socket detaches (grace period) rather
 * than killing the shells, so a background reconnect re-attaches the same tabs
 * and replays the output buffered while disconnected.
 */
const LONG_CMD_MS = 10_000;

export function registerMobileWS(app: FastifyInstance, sessionMgr: SessionManager) {
  app.get('/ws/mobile', { websocket: true }, (socket) => {
    const ws = socket as unknown as Sock;
    const connId = randomUUID().slice(0, 8);
    let authenticated = false;
    let key = connId; // session key — deviceId when available, else connId

    // sessionId → timestamp when a command was submitted (for durationMs).
    const cmdStart = new Map<string, number>();
    // Per-socket listener removers, so a detach/reattach doesn't leak handlers.
    const cleanups: Array<() => void> = [];

    const pingTimer = setInterval(() => emit(ws, { type: 'ping_server' }), 30_000);

    /** Wire a PTY session's events to THIS socket; returns a cleanup fn. */
    function wire(sess: PtyTerminalSession): void {
      const onRaw = (data: string) =>
        emit(ws, { type: 'raw', data, session: sess.sessionId });
      const onOutput = (data: string, replaceLast: number) =>
        emit(ws, { type: 'output', data, replace: replaceLast, session: sess.sessionId });
      const onClear = () =>
        emit(ws, { type: 'clear_output', session: sess.sessionId });
      const onPrompt = (cwd: string, exitCode: number) => {
        const startedAt = cmdStart.get(sess.sessionId);
        let durationMs: number | undefined;
        if (startedAt !== undefined) {
          durationMs = Date.now() - startedAt;
          cmdStart.delete(sess.sessionId);
        }
        emit(ws, {
          type: 'prompt',
          cwd,
          exitCode,
          session: sess.sessionId,
          ...(durationMs !== undefined ? { durationMs } : {}),
        });
      };
      const onExit = (code: number) => {
        sessionMgr.closeMobileSession(key, sess.sessionId);
        emit(ws, { type: 'session_exit', id: sess.sessionId, exitCode: code });
        emit(ws, { type: 'session_closed', id: sess.sessionId });
      };

      sess.on('raw_output', onRaw);
      sess.on('output', onOutput);
      sess.on('clear_output', onClear);
      sess.on('prompt', onPrompt);
      sess.once('exit', onExit);

      cleanups.push(() => {
        sess.off('raw_output', onRaw);
        sess.off('output', onOutput);
        sess.off('clear_output', onClear);
        sess.off('prompt', onPrompt);
        sess.off('exit', onExit);
      });
    }

    socket.on('message', async (raw: Buffer | string) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(raw.toString()); }
      catch { emit(ws, { type: 'error', message: 'JSON inválido' }); return; }

      // ── Auth ──────────────────────────────────────────────────────────────
      if (!authenticated) {
        if (msg.type !== 'auth' || typeof msg.token !== 'string') {
          emit(ws, { type: 'error', message: 'Autenticación requerida' });
          return;
        }
        try {
          const payload = app.jwt.verify(msg.token) as { deviceId?: string | null };
          authenticated = true;
          key = payload.deviceId || connId;

          if (sessionMgr.hasLiveSessions(key)) {
            // ── Re-attach: same device reconnecting within the grace period ──
            const sessions = sessionMgr.reattachDevice(key);
            for (const sess of sessions) wire(sess);
            emit(ws, {
              type: 'authenticated',
              connectionId: connId,
              reattached: true,
              sessions: sessions.map((s) => ({
                id: s.sessionId, cwd: s.cwd, label: shortCwd(s.cwd),
              })),
            });
            // Replay buffered output so the client rebuilds each terminal.
            for (const sess of sessions) {
              const buf = sess.rawBuffer;
              if (buf) emit(ws, { type: 'raw', data: buf, session: sess.sessionId, replay: true });
            }
            app.log.info(`[MOBILE] Re-attached — key: ${key}, sessions: ${sessions.length}`);
          } else {
            // ── Fresh session ──
            const sess = sessionMgr.createMobileSession(key);
            wire(sess);
            emit(ws, {
              type: 'authenticated',
              connectionId: connId,
              reattached: false,
              sessions: [{ id: sess.sessionId, cwd: sess.cwd, label: shortCwd(sess.cwd) }],
            });
          }
        } catch {
          emit(ws, { type: 'error', message: 'Token inválido o expirado' });
          socket.close();
        }
        return;
      }

      // ── Ping ──────────────────────────────────────────────────────────────
      if (msg.type === 'ping') { emit(ws, { type: 'pong' }); return; }

      // ── Raw input → PTY session ───────────────────────────────────────────
      if (msg.type === 'input') {
        const data = String(msg.data ?? '');
        if (!data) return;
        const sess = _resolve(key, msg, sessionMgr);
        if (sess) {
          // A carriage return marks command submission → start the timer.
          if (data.includes('\r')) cmdStart.set(sess.sessionId, Date.now());
          sess.write(data);
        }
        return;
      }

      // ── Resize ────────────────────────────────────────────────────────────
      if (msg.type === 'resize') {
        const cols = clamp(Number(msg.cols) || 80, 20, 400);
        const rows = clamp(Number(msg.rows) || 24, 5, 100);
        _resolve(key, msg, sessionMgr)?.resize(cols, rows);
        return;
      }

      // ── New session (tab) ─────────────────────────────────────────────────
      if (msg.type === 'session_new') {
        const cwd = sessionMgr.getActiveMobileSession(key)?.cwd;
        const sess = sessionMgr.createMobileSession(key, cwd);
        wire(sess);
        emit(ws, {
          type: 'session_created',
          id: sess.sessionId,
          cwd: sess.cwd,
          label: shortCwd(sess.cwd),
        });
        return;
      }

      // ── Close session (tab) ───────────────────────────────────────────────
      if (msg.type === 'session_close') {
        const id = String(msg.id ?? '');
        sessionMgr.closeMobileSession(key, id);
        emit(ws, { type: 'session_closed', id });
        return;
      }
    });

    // On socket drop: remove this socket's listeners and start the grace timer
    // (detach) instead of killing the shells, so a quick reconnect re-attaches.
    const onGone = () => {
      clearInterval(pingTimer);
      for (const fn of cleanups) fn();
      cleanups.length = 0;
      if (authenticated) sessionMgr.detachDevice(key);
    };
    socket.on('close', onGone);
    socket.on('error', onGone);
  });
}

/** Resolve the target session from message field or fall back to active. */
function _resolve(
  key: string,
  msg: Record<string, unknown>,
  sessionMgr: SessionManager,
): PtyTerminalSession | undefined {
  const id = typeof msg.session === 'string' ? msg.session : '';
  return id
    ? sessionMgr.getMobileSession(key, id)
    : sessionMgr.getActiveMobileSession(key);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
