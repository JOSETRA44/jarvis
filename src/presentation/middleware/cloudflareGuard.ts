import type { FastifyInstance } from 'fastify';

const PUBLIC_PREFIXES = ['/api/', '/ws/'];

export function registerCloudflareGuard(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    const viaTunnel = !!req.headers['cf-ray'];
    if (!viaTunnel) return;

    const url = req.url.split('?')[0];
    const isPublic = PUBLIC_PREFIXES.some((p) => url.startsWith(p));
    if (!isPublic) {
      reply.code(403).send({
        error: 'Dashboard access is restricted to the local network.',
      });
    }
  });
}
