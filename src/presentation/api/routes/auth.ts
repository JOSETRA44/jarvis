import type { FastifyInstance } from 'fastify';

// Brute-force protection: rate-limit only FAILED logins. Successful logins
// never count and reset the counter, so a legitimate admin reconnecting (even
// rapidly, e.g. after backgrounding the app) can never ban themselves — while
// an attacker (all failures) is still throttled at MAX_FAILURES / WINDOW_MS.
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

/** Returns remaining lockout seconds if the IP is blocked, else 0. */
function blockedFor(ip: string): number {
  const now = Date.now();
  const entry = loginFailures.get(ip);
  if (!entry || now > entry.resetAt) return 0;
  if (entry.count >= MAX_FAILURES) {
    return Math.ceil((entry.resetAt - now) / 1000);
  }
  return 0;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = loginFailures.get(ip);
  if (!entry || now > entry.resetAt) {
    loginFailures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

function resetFailures(ip: string): void {
  loginFailures.delete(ip);
}

export async function authRoutes(
  app: FastifyInstance,
  dashboardPassword: string,
  allowedDeviceIds: string[],
) {
  app.post<{ Body: { password: string; deviceId?: string } }>(
    '/api/auth/login',
    async (req, reply) => {
      const ip = req.ip ?? 'unknown';
      const { password, deviceId } = req.body;

      const retryAfter = blockedFor(ip);
      if (retryAfter > 0) {
        app.log.warn(`[AUTH] Rate limit (failures) — IP: ${ip}, retryAfter: ${retryAfter}s`);
        reply.header('Retry-After', String(retryAfter));
        return reply.code(429).send({
          error: `Demasiados intentos fallidos. Reintenta en ${retryAfter}s.`,
        });
      }

      if (password !== dashboardPassword) {
        recordFailure(ip);
        app.log.warn(`[AUTH] Wrong password — IP: ${ip}`);
        return reply.code(401).send({ error: 'Contraseña incorrecta' });
      }

      if (allowedDeviceIds.length > 0) {
        if (!deviceId || !allowedDeviceIds.includes(deviceId)) {
          recordFailure(ip);
          app.log.warn(`[AUTH] Unauthorized device — IP: ${ip}, deviceId: ${deviceId ?? 'none'}`);
          return reply.code(401).send({ error: 'Dispositivo no autorizado' });
        }
      }

      // Success — clear any prior failures so legit re-auth is never penalized.
      resetFailures(ip);
      app.log.info(`[AUTH] Login OK — IP: ${ip}, deviceId: ${deviceId ?? 'none'}`);
      const token = app.jwt.sign(
        { role: 'admin', deviceId: deviceId ?? null },
        { expiresIn: '2h' },
      );
      return { token };
    },
  );
}
