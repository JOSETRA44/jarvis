import type { Command } from '../entities/Command.js';

export interface ICommandRepository {
  findBySession(sessionId: string, limit?: number): Promise<Command[]>;
  findRecent(limit?: number): Promise<Command[]>;
  create(data: Omit<Command, 'id' | 'executedAt'>): Promise<Command>;
}
