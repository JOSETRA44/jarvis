import type { FastifyInstance } from 'fastify';
import type { IOperatorRepository } from '../../../domain/ports/IOperatorRepository.js';
import { authGuard } from '../middleware/authGuard.js';

export async function operatorRoutes(app: FastifyInstance, repo: IOperatorRepository) {
  app.get('/api/operators', { preHandler: authGuard }, async () => {
    return repo.findAll();
  });

  app.post<{ Body: { platform: 'whatsapp' | 'telegram'; identifier: string; displayName: string; permissions: string[] } }>(
    '/api/operators',
    { preHandler: authGuard },
    async (req) => {
      return repo.create(req.body as Parameters<typeof repo.create>[0]);
    }
  );

  app.put<{ Params: { id: string }; Body: { displayName?: string; permissions?: string[]; enabled?: boolean } }>(
    '/api/operators/:id',
    { preHandler: authGuard },
    async (req) => {
      return repo.update(req.params.id, req.body as Parameters<typeof repo.update>[1]);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/api/operators/:id',
    { preHandler: authGuard },
    async (req) => {
      await repo.delete(req.params.id);
      return { ok: true };
    }
  );
}
