import type { Operator, Permission } from '../entities/Operator.js';
import type { Platform } from '../entities/Session.js';

export interface CreateOperatorDTO {
  platform: Platform;
  identifier: string;
  displayName: string;
  permissions: Permission[];
}

export interface IOperatorRepository {
  findByIdentifier(platform: Platform, identifier: string): Promise<Operator | null>;
  findAll(): Promise<Operator[]>;
  create(dto: CreateOperatorDTO): Promise<Operator>;
  update(id: string, data: Partial<Pick<Operator, 'displayName' | 'permissions' | 'enabled'>>): Promise<Operator>;
  delete(id: string): Promise<void>;
}
