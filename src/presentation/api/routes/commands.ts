import type { FastifyInstance } from 'fastify';
import type { ICommandRepository } from '../../../domain/ports/ICommandRepository.js';
import { authGuard } from '../middleware/authGuard.js';

export async function commandRoutes(app: FastifyInstance, repo: ICommandRepository) {
  app.get<{ Querystring: { limit?: string } }>(
    '/api/commands',
    { preHandler: authGuard },
    async (req) => {
      const limit = parseInt(req.query.limit ?? '20');
      return repo.findRecent(limit);
    }
  );
}
