import type { FastifyInstance } from 'fastify';
import type { IMessengerAdapter } from '../../../domain/ports/IMessengerAdapter.js';
import { authGuard } from '../middleware/authGuard.js';

export async function botRoutes(
  app: FastifyInstance,
  adapters: IMessengerAdapter[],
  latestQR: { dataUrl: string | null }
) {
  app.get('/api/bots', { preHandler: authGuard }, async () => {
    return adapters.map((a) => a.getStatus());
  });

  app.get('/api/bots/qr', { preHandler: authGuard }, async (_, reply) => {
    if (!latestQR.dataUrl) return reply.code(404).send({ error: 'QR no disponible' });
    return { qr: latestQR.dataUrl };
  });

  app.post<{ Params: { platform: string } }>(
    '/api/bots/:platform/disconnect',
    { preHandler: authGuard },
    async (req) => {
      const adapter = adapters.find((a) => a.platform === req.params.platform);
      if (!adapter) return { error: 'Plataforma no encontrada' };
      await adapter.disconnect();
      return { ok: true };
    }
  );
}
