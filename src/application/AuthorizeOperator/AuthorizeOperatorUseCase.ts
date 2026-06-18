import type { IOperatorRepository } from '../../domain/ports/IOperatorRepository.js';
import type { Operator, Permission } from '../../domain/entities/Operator.js';
import type { Platform } from '../../domain/entities/Session.js';

export class AuthorizeOperatorUseCase {
  constructor(private operatorRepo: IOperatorRepository) {}

  async execute(platform: Platform, identifier: string): Promise<Operator | null> {
    const operator = await this.operatorRepo.findByIdentifier(platform, identifier);
    if (!operator || !operator.enabled) return null;
    return operator;
  }

  hasPermission(operator: Operator, permission: Permission): boolean {
    return operator.permissions.includes(permission) || operator.permissions.includes('admin');
  }
}
