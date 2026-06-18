import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';

export async function authRoutes(app: FastifyInstance, dashboardPassword: string) {
  app.post<{ Body: { password: string } }>('/api/auth/login', async (req, reply) => {
    const { password } = req.body;
    const valid = await bcrypt.compare(password, await bcrypt.hash(dashboardPassword, 10));

    if (password !== dashboardPassword && !valid) {
      return reply.code(401).send({ error: 'Contraseña incorrecta' });
    }

    const token = app.jwt.sign({ role: 'admin' }, { expiresIn: '8h' });
    return { token };
  });
}
