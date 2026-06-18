export type OperatingMode = 'ai' | 'restricted' | 'full-shell';

export class ModeManager {
  private mode: OperatingMode;

  constructor(initialMode: OperatingMode = 'ai') {
    this.mode = initialMode;
  }

  get(): OperatingMode {
    return this.mode;
  }

  set(mode: OperatingMode): void {
    this.mode = mode;
  }
}
