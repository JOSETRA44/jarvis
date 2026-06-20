import type { FastifyInstance } from 'fastify';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
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

      if (!checkRateLimit(ip)) {
        app.log.warn(`[AUTH] Rate limit exceeded — IP: ${ip}`);
        return reply.code(429).send({ error: 'Demasiados intentos. Espera 15 minutos.' });
      }

      if (password !== dashboardPassword) {
        app.log.warn(`[AUTH] Wrong password — IP: ${ip}`);
        return reply.code(401).send({ error: 'Contraseña incorrecta' });
      }

      if (allowedDeviceIds.length > 0) {
        if (!deviceId || !allowedDeviceIds.includes(deviceId)) {
          app.log.warn(`[AUTH] Unauthorized device — IP: ${ip}, deviceId: ${deviceId ?? 'none'}`);
          return reply.code(401).send({ error: 'Dispositivo no autorizado' });
        }
      }

      app.log.info(`[AUTH] Login OK — IP: ${ip}, deviceId: ${deviceId ?? 'none'}`);
      const token = app.jwt.sign(
        { role: 'admin', deviceId: deviceId ?? null },
        { expiresIn: '2h' },
      );
      return { token };
    },
  );
}
