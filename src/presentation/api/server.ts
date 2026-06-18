import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyWebSocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import type { Config } from '../../infrastructure/config/EnvConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildServer(config: Config) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: { target: 'pino-pretty', options: { colorize: true } },
    },
  });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyJwt, { secret: config.JWT_SECRET });
  await app.register(fastifyWebSocket);

  const dashboardDist = join(__dirname, '../../../dashboard/dist');
  if (existsSync(dashboardDist)) {
    await app.register(fastifyStatic, {
      root: dashboardDist,
      prefix: '/',
    });
  }

  return app;
}

export type FastifyApp = Awaited<ReturnType<typeof buildServer>>;
