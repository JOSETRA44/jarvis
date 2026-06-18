export interface ExecuteOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface ExecuteResult {
  output: string;
  exitCode: number;
  durationMs: number;
}

export interface ITerminalExecutor {
  execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;
  executeStream(
    command: string,
    onData: (chunk: string) => void,
    options?: ExecuteOptions
  ): Promise<ExecuteResult>;
}
