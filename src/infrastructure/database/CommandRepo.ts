import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { Db } from './client.js';
import { commands } from './schema.js';
import type { ICommandRepository } from '../../domain/ports/ICommandRepository.js';
import type { Command } from '../../domain/entities/Command.js';

function mapRow(row: typeof commands.$inferSelect): Command {
  return {
    id: row.id,
    sessionId: row.sessionId,
    operatorId: row.operatorId,
    input: row.input,
    output: row.output,
    exitCode: row.exitCode,
    executedAt: new Date(row.executedAt),
    durationMs: row.durationMs,
  };
}

export class CommandRepo implements ICommandRepository {
  constructor(private db: Db) {}

  async findBySession(sessionId: string, limit = 50): Promise<Command[]> {
    return this.db
      .select()
      .from(commands)
      .where(eq(commands.sessionId, sessionId))
      .orderBy(desc(commands.executedAt))
      .limit(limit)
      .all()
      .map(mapRow);
  }

  async findRecent(limit = 20): Promise<Command[]> {
    return this.db
      .select()
      .from(commands)
      .orderBy(desc(commands.executedAt))
      .limit(limit)
      .all()
      .map(mapRow);
  }

  async create(data: Omit<Command, 'id' | 'executedAt'>): Promise<Command> {
    const id = uuidv4();
    const now = new Date();
    this.db.insert(commands).values({
      id,
      sessionId: data.sessionId,
      operatorId: data.operatorId,
      input: data.input,
      output: data.output,
      exitCode: data.exitCode,
      executedAt: now,
      durationMs: data.durationMs,
    }).run();
    return (await this.findBySession(data.sessionId, 1))[0];
  }
}
