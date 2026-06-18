import type { Platform } from './Session.js';

export type Permission = 'ai' | 'restricted' | 'full-shell' | 'interactive' | 'admin';

export interface Operator {
  id: string;
  platform: Platform;
  identifier: string;
  displayName: string;
  permissions: Permission[];
  enabled: boolean;
  createdAt: Date;
}
