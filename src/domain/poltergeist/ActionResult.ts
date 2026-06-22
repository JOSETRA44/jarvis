export interface ActionResult {
  readonly success: boolean;
  readonly output: string;
  readonly data?: string; // base64 PNG for screenshots
}
