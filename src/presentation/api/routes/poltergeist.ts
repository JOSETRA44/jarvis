import type { FastifyInstance } from 'fastify';
import type { GetVoicesUseCase } from '../../../application/GetVoices/GetVoicesUseCase.js';
import { ACTION_CATALOG } from '../../../infrastructure/gui/ActionCatalog.js';

export async function poltergeistRoutes(app: FastifyInstance, getVoices: GetVoicesUseCase) {
  app.get('/api/poltergeist/catalog', async (req, reply) => {
    const auth = req.headers.authorization?.replace('Bearer ', '') ?? '';
    try {
      app.jwt.verify(auth);
    } catch {
      return reply.code(401).send({ error: 'Token requerido' });
    }
    return { actions: ACTION_CATALOG };
  });

  app.get('/api/poltergeist/voices', async (req, reply) => {
    const auth = req.headers.authorization?.replace('Bearer ', '') ?? '';
    try {
      app.jwt.verify(auth);
    } catch {
      return reply.code(401).send({ error: 'Token requerido' });
    }
    return getVoices.execute();
  });
}
