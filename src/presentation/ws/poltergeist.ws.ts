import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { ExecuteGuiActionUseCase } from '../../application/ExecuteGuiAction/ExecuteGuiActionUseCase.js';
import type { GetVoicesUseCase } from '../../application/GetVoices/GetVoicesUseCase.js';
import { ACTION_CATALOG } from '../../infrastructure/gui/ActionCatalog.js';

type Sock = { readyState: number; send: (d: string) => void; close: () => void };

function emit(s: Sock, payload: object) {
  if (s.readyState === 1) s.send(JSON.stringify(payload));
}

/**
 * Poltergeist WebSocket endpoint — /ws/poltergeist
 *
 * Protocol (all messages are JSON):
 *
 * Client → Server:
 *   { type: "auth",           token: string }
 *   { type: "get_catalog" }
 *   { type: "get_voices" }
 *   { type: "execute_action", actionId: string, params?: Record<string,string> }
 *   { type: "ping" }
 *
 * Server → Client:
 *   { type: "authenticated",  catalog: GuiAction[] }
 *   { type: "catalog",        actions: GuiAction[] }
 *   { type: "voices",         voices: VoiceProfile[], presets: string[] }
 *   { type: "action_result",  actionId: string, success: boolean, output: string, data?: string }
 *   { type: "pong" }
 *   { type: "error",          message: string }
 *
 * Security layers:
 *   1. JWT verify  — same secret as /api/auth/login
 *   2. Device ID   — must be in ALLOWED_DEVICE_IDS env var (if set)
 *   3. Whitelist   — actionId must exist in ACTION_CATALOG
 *   4. Rate limit  — two buckets per connection (per 30s):
 *                    - interactive (mouse_ / kb_ actions): 60 — fast sniper taps
 *                    - heavy (apps/screenshot/tts): 12 — protect host CPU
 */
const INTERACTIVE_LIMIT = 60;
const HEAVY_LIMIT = 12;

function isInteractive(actionId: string): boolean {
  return actionId.startsWith('mouse_') || actionId.startsWith('kb_');
}

export function registerPoltergeistWS(
  app: FastifyInstance,
  useCase: ExecuteGuiActionUseCase,
  getVoices: GetVoicesUseCase,
) {
  app.get('/ws/poltergeist', { websocket: true }, (socket) => {
    const ws = socket as unknown as Sock;
    const connId = randomUUID().slice(0, 8);
    let authenticated = false;

    // Two-bucket rate limiter, reset every 30s
    let interactiveCount = 0;
    let heavyCount = 0;
    const rlTimer = setInterval(() => { interactiveCount = 0; heavyCount = 0; }, 30_000);

    socket.on('message', async (raw: Buffer | string) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        emit(ws, { type: 'error', message: 'JSON inválido' });
        return;
      }

      // ── Auth ─────────────────────────────────────────────────────────────
      if (!authenticated) {
        if (msg.type !== 'auth' || typeof msg.token !== 'string') {
          emit(ws, { type: 'error', message: 'Autenticación requerida' });
          return;
        }
        try {
          const payload = app.jwt.verify(msg.token) as { deviceId?: string };
          const allowed = (process.env.ALLOWED_DEVICE_IDS ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (allowed.length > 0) {
            if (!payload.deviceId || !allowed.includes(payload.deviceId)) {
              emit(ws, { type: 'error', message: 'Dispositivo no autorizado' });
              socket.close();
              return;
            }
          }
          authenticated = true;
          app.log.info(`[POLTERGEIST] Connected — conn: ${connId}, device: ${payload.deviceId ?? 'none'}`);
          emit(ws, { type: 'authenticated', catalog: ACTION_CATALOG });
        } catch {
          emit(ws, { type: 'error', message: 'Token inválido o expirado' });
          socket.close();
        }
        return;
      }

      // ── Ping ─────────────────────────────────────────────────────────────
      if (msg.type === 'ping') {
        emit(ws, { type: 'pong' });
        return;
      }

      // ── Get catalog ──────────────────────────────────────────────────────
      if (msg.type === 'get_catalog') {
        emit(ws, { type: 'catalog', actions: ACTION_CATALOG });
        return;
      }

      // ── Get voices ─────────────────────────────────────────────────────────
      if (msg.type === 'get_voices') {
        const { voices, presets } = await getVoices.execute();
        emit(ws, { type: 'voices', voices, presets });
        return;
      }

      // ── Execute action ───────────────────────────────────────────────────
      if (msg.type === 'execute_action') {
        const actionId = String(msg.actionId ?? '');
        const interactive = isInteractive(actionId);
        if (interactive) {
          if (++interactiveCount > INTERACTIVE_LIMIT) {
            emit(ws, { type: 'error', message: `Límite de acciones rápidas (${INTERACTIVE_LIMIT}/30s)` });
            return;
          }
        } else {
          if (++heavyCount > HEAVY_LIMIT) {
            emit(ws, { type: 'error', message: `Límite de acciones (${HEAVY_LIMIT}/30s)` });
            return;
          }
        }
        const params = (msg.params ?? {}) as Record<string, string>;
        app.log.info(`[POLTERGEIST] Action: ${actionId} — conn: ${connId}`);
        const result = await useCase.execute(actionId, params);
        emit(ws, { type: 'action_result', actionId, ...result });
        return;
      }
    });

    socket.on('close', () => {
      clearInterval(rlTimer);
      app.log.info(`[POLTERGEIST] Disconnected — conn: ${connId}`);
    });
    socket.on('error', () => clearInterval(rlTimer));
  });
}
