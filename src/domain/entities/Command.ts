export interface Command {
  id: string;
  sessionId: string;
  operatorId: string;
  input: string;
  output: string;
  exitCode: number | null;
  executedAt: Date;
  durationMs: number;
}
