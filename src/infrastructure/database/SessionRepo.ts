import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { Db } from './client.js';
import { sessions } from './schema.js';
import type { ISessionRepository } from '../../domain/ports/ISessionRepository.js';
import type { Session, Platform, SessionStatus } from '../../domain/entities/Session.js';

function mapRow(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    operatorId: row.operatorId,
    platform: row.platform as Platform,
    pid: row.pid,
    cwd: row.cwd,
    status: row.status as SessionStatus,
    createdAt: new Date(row.createdAt),
    lastActivityAt: new Date(row.lastActivityAt),
  };
}

export class SessionRepo implements ISessionRepository {
  constructor(private db: Db) {}

  async findActiveByOperator(operatorId: string): Promise<Session | null> {
    const row = this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.operatorId, operatorId), eq(sessions.status, 'active')))
      .get();
    return row ? mapRow(row) : null;
  }

  async findById(id: string): Promise<Session | null> {
    const row = this.db.select().from(sessions).where(eq(sessions.id, id)).get();
    return row ? mapRow(row) : null;
  }

  async findAll(): Promise<Session[]> {
    return this.db.select().from(sessions).all().map(mapRow);
  }

  async create(data: Omit<Session, 'id' | 'createdAt' | 'lastActivityAt'>): Promise<Session> {
    const id = uuidv4();
    const now = new Date();
    this.db.insert(sessions).values({
      id,
      operatorId: data.operatorId,
      platform: data.platform,
      pid: data.pid,
      cwd: data.cwd,
      status: data.status,
      createdAt: now,
      lastActivityAt: now,
    }).run();
    return (await this.findById(id))!;
  }

  async update(id: string, data: Partial<Session>): Promise<Session> {
    const updates: Record<string, unknown> = {};
    if (data.status !== undefined) updates.status = data.status;
    if (data.pid !== undefined) updates.pid = data.pid;
    if (data.cwd !== undefined) updates.cwd = data.cwd;
    updates.lastActivityAt = new Date();
    this.db.update(sessions).set(updates).where(eq(sessions.id, id)).run();
    return (await this.findById(id))!;
  }

  async close(id: string): Promise<void> {
    this.db
      .update(sessions)
      .set({ status: 'closed', lastActivityAt: new Date() })
      .where(eq(sessions.id, id))
      .run();
  }
}
