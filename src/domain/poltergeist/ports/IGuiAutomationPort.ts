import type { ActionResult } from '../ActionResult.js';

export interface IGuiAutomationPort {
  execute(actionId: string, params?: Record<string, string>): Promise<ActionResult>;
}
