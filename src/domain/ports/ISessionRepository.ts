import type { Session } from '../entities/Session.js';
import type { Platform } from '../entities/Session.js';

export interface ISessionRepository {
  findActiveByOperator(operatorId: string): Promise<Session | null>;
  findById(id: string): Promise<Session | null>;
  findAll(): Promise<Session[]>;
  create(data: Omit<Session, 'id' | 'createdAt' | 'lastActivityAt'>): Promise<Session>;
  update(id: string, data: Partial<Session>): Promise<Session>;
  close(id: string): Promise<void>;
}
