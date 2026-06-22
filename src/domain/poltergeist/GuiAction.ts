export type ActionCategory = 'apps' | 'media' | 'system' | 'tts' | 'keyboard' | 'mouse';

export interface ActionParam {
  readonly name: string;
  readonly type: 'string' | 'number';
  /** Max length for string params. */
  readonly maxLen?: number;
  /** Inclusive bounds for number params (used for clamping). */
  readonly min?: number;
  readonly max?: number;
}

export interface GuiAction {
  readonly id: string;
  readonly label: string;
  readonly category: ActionCategory;
  readonly icon: string;
  readonly params?: ActionParam[];
  /**
   * Whitelisted but not rendered as a grid button (e.g. sniper-mode mouse
   * actions invoked by tapping the screenshot). Defaults to false.
   */
  readonly hidden?: boolean;
}
