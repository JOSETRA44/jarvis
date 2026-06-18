import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { Db } from './client.js';
import { operators } from './schema.js';
import type { IOperatorRepository, CreateOperatorDTO } from '../../domain/ports/IOperatorRepository.js';
import type { Operator, Permission } from '../../domain/entities/Operator.js';
import type { Platform } from '../../domain/entities/Session.js';

function mapRow(row: typeof operators.$inferSelect): Operator {
  return {
    id: row.id,
    platform: row.platform as Platform,
    identifier: row.identifier,
    displayName: row.displayName,
    permissions: JSON.parse(row.permissions) as Permission[],
    enabled: row.enabled,
    createdAt: new Date(row.createdAt),
  };
}

export class OperatorRepo implements IOperatorRepository {
  constructor(private db: Db) {}

  async findByIdentifier(platform: Platform, identifier: string): Promise<Operator | null> {
    const row = this.db
      .select()
      .from(operators)
      .where(and(eq(operators.platform, platform), eq(operators.identifier, identifier)))
      .get();
    return row ? mapRow(row) : null;
  }

  async findAll(): Promise<Operator[]> {
    return this.db.select().from(operators).all().map(mapRow);
  }

  async create(dto: CreateOperatorDTO): Promise<Operator> {
    const id = uuidv4();
    const now = new Date();
    this.db.insert(operators).values({
      id,
      platform: dto.platform,
      identifier: dto.identifier,
      displayName: dto.displayName,
      permissions: JSON.stringify(dto.permissions),
      enabled: true,
      createdAt: now,
    }).run();
    return (await this.findByIdentifier(dto.platform, dto.identifier))!;
  }

  async update(id: string, data: Partial<Pick<Operator, 'displayName' | 'permissions' | 'enabled'>>): Promise<Operator> {
    const updates: Record<string, unknown> = {};
    if (data.displayName !== undefined) updates.displayName = data.displayName;
    if (data.permissions !== undefined) updates.permissions = JSON.stringify(data.permissions);
    if (data.enabled !== undefined) updates.enabled = data.enabled;
    this.db.update(operators).set(updates).where(eq(operators.id, id)).run();
    const row = this.db.select().from(operators).where(eq(operators.id, id)).get();
    if (!row) throw new Error(`Operator ${id} not found`);
    return mapRow(row);
  }

  async delete(id: string): Promise<void> {
    this.db.delete(operators).where(eq(operators.id, id)).run();
  }
}
