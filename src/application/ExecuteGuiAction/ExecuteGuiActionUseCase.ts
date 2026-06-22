import type { IGuiAutomationPort } from '../../domain/poltergeist/ports/IGuiAutomationPort.js';
import type { ActionResult } from '../../domain/poltergeist/ActionResult.js';
import { CATALOG_MAP } from '../../infrastructure/gui/ActionCatalog.js';

export class ExecuteGuiActionUseCase {
  constructor(private readonly gui: IGuiAutomationPort) {}

  async execute(actionId: string, params?: Record<string, string>): Promise<ActionResult> {
    const action = CATALOG_MAP.get(actionId);
    if (!action) {
      return { success: false, output: `Acción no permitida: ${actionId}` };
    }

    // Validate & normalize declared params (centralizes coordinate validation).
    const safe: Record<string, string> = { ...(params ?? {}) };
    for (const param of action.params ?? []) {
      if (param.type === 'number') {
        const raw = safe[param.name];
        const n = Number(raw);
        if (raw === undefined || !Number.isFinite(n)) {
          return { success: false, output: `Parámetro inválido: ${param.name}` };
        }
        const lo = param.min ?? -Infinity;
        const hi = param.max ?? Infinity;
        safe[param.name] = String(Math.min(hi, Math.max(lo, n)));
      }
    }

    return this.gui.execute(actionId, safe);
  }
}
