const BASE = '/api';

function token() {
  return localStorage.getItem('jarvis_token') ?? '';
}

function headers(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...extra };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  login: (password: string) =>
    fetch(BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).then((r) => r.json()),

  operators: {
    list: () => req<Operator[]>('GET', '/operators'),
    create: (data: Partial<Operator>) => req<Operator>('POST', '/operators', data),
    update: (id: string, data: Partial<Operator>) => req<Operator>('PUT', `/operators/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/operators/${id}`),
  },

  commands: {
    recent: (limit = 20) => req<Command[]>('GET', `/commands?limit=${limit}`),
  },

  bots: {
    list: () => req<BotStatus[]>('GET', '/bots'),
    qr: () => req<{ qr: string }>('GET', '/bots/qr'),
    disconnect: (platform: string) => req<void>('POST', `/bots/${platform}/disconnect`),
  },

  config: {
    get: () => req<{ mode: string }>('GET', '/config'),
    update: (data: { mode?: string }) => req<{ mode: string }>('PUT', '/config', data),
  },
};

export interface Operator {
  id: string;
  platform: 'whatsapp' | 'telegram';
  identifier: string;
  displayName: string;
  permissions: string[];
  enabled: boolean;
  createdAt: string;
}

export interface Command {
  id: string;
  sessionId: string;
  operatorId: string;
  input: string;
  output: string;
  exitCode: number | null;
  executedAt: string;
  durationMs: number;
}

export interface BotStatus {
  platform: 'whatsapp' | 'telegram';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  identifier: string | null;
}
