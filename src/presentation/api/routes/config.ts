import type { FastifyInstance } from 'fastify';
import type { ModeManager } from '../../../infrastructure/config/ModeManager.js';
import { authGuard } from '../middleware/authGuard.js';

export async function configRoutes(app: FastifyInstance, modeManager: ModeManager) {
  app.get('/api/config', { preHandler: authGuard }, async () => {
    return { mode: modeManager.get() };
  });

  app.put<{ Body: { mode?: 'ai' | 'restricted' | 'full-shell' } }>(
    '/api/config',
    { preHandler: authGuard },
    async (req) => {
      if (req.body.mode) modeManager.set(req.body.mode);
      return { mode: modeManager.get() };
    }
  );
}
