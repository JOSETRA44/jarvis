export class RateLimiter {
  private counts = new Map<string, { count: number; resetAt: number }>();

  constructor(private maxPerMinute: number) {}

  isLimited(operatorId: string): boolean {
    const now = Date.now();
    const entry = this.counts.get(operatorId);
    if (!entry || now > entry.resetAt) return false;
    return entry.count >= this.maxPerMinute;
  }

  record(operatorId: string): void {
    const now = Date.now();
    const entry = this.counts.get(operatorId);
    if (!entry || now > entry.resetAt) {
      this.counts.set(operatorId, { count: 1, resetAt: now + 60_000 });
    } else {
      entry.count++;
    }
  }
}
