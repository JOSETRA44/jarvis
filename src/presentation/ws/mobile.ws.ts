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
 *   { type: "authenticated",   connectionId, sessions: [{id, cwd, label}] }
 *   { type: "session_created", id, cwd, label }
 *   { type: "session_closed",  id }
 *   { type: "output",          data: string, session: string }  ← ANSI-stripped text
 *   { type: "prompt",          cwd: string, exitCode: number, session: string }
 *   { type: "pong" }
 *   { type: "error",           message: string }
 *
 * Key differences from v1:
 * - No command/executing/chunk/result distinction — all I/O is raw PTY
 * - No !prefix routing — every process runs natively in PTY (isTTY=true)
 * - Multi-session (tabs) per connection
 * - Shell integration markers detect command boundaries (CWD, exitCode)
 */
export function registerMobileWS(app: FastifyInstance, sessionMgr: SessionManager) {
  app.get('/ws/mobile', { websocket: true }, (socket) => {
    const ws = socket as unknown as Sock;
    const connId = randomUUID().slice(0, 8);
    let authenticated = false;

    const pingTimer = setInterval(() => emit(ws, { type: 'ping_server' }), 30_000);

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
          app.jwt.verify(msg.token);
          authenticated = true;
          const sess = sessionMgr.createMobileSession(connId);
          _wireSession(ws, connId, sess, sessionMgr);
          emit(ws, {
            type: 'authenticated',
            connectionId: connId,
            sessions: [{ id: sess.sessionId, cwd: sess.cwd, label: shortCwd(sess.cwd) }],
          });
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
        const sess = _resolve(connId, msg, sessionMgr);
        sess?.write(data);
        return;
      }

      // ── Resize ────────────────────────────────────────────────────────────
      if (msg.type === 'resize') {
        const cols = clamp(Number(msg.cols) || 80, 20, 400);
        const rows = clamp(Number(msg.rows) || 24, 5, 100);
        _resolve(connId, msg, sessionMgr)?.resize(cols, rows);
        return;
      }

      // ── New session (tab) ─────────────────────────────────────────────────
      if (msg.type === 'session_new') {
        const cwd = sessionMgr.getActiveMobileSession(connId)?.cwd;
        const sess = sessionMgr.createMobileSession(connId, cwd);
        _wireSession(ws, connId, sess, sessionMgr);
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
        sessionMgr.closeMobileSession(connId, id);
        emit(ws, { type: 'session_closed', id });
        return;
      }
    });

    socket.on('close', () => { clearInterval(pingTimer); sessionMgr.closeAllMobileSessions(connId); });
    socket.on('error', () => { clearInterval(pingTimer); sessionMgr.closeAllMobileSessions(connId); });
  });
}

/** Resolve the target session from message field or fall back to active. */
function _resolve(
  connId: string,
  msg: Record<string, unknown>,
  sessionMgr: SessionManager,
): PtyTerminalSession | undefined {
  const id = typeof msg.session === 'string' ? msg.session : '';
  return id
    ? sessionMgr.getMobileSession(connId, id)
    : sessionMgr.getActiveMobileSession(connId);
}

/** Subscribe to a session's PTY events and forward them over the WebSocket. */
function _wireSession(
  ws: Sock,
  connId: string,
  sess: PtyTerminalSession,
  sessionMgr: SessionManager,
) {
  sess.on('output', (data: string) => {
    emit(ws, { type: 'output', data, session: sess.sessionId });
  });
  sess.on('prompt', (cwd: string, exitCode: number) => {
    emit(ws, { type: 'prompt', cwd, exitCode, session: sess.sessionId });
  });
  sess.once('exit', () => {
    sessionMgr.closeMobileSession(connId, sess.sessionId);
    emit(ws, { type: 'session_closed', id: sess.sessionId });
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
