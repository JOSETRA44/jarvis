import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

const clients = new Map<string, Set<WebSocket>>();

export function registerTerminalWS(app: FastifyInstance) {
  app.get('/ws/terminal', { websocket: true }, (socket) => {
    let operatorId: string | null = null;

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe' && msg.operatorId) {
          operatorId = msg.operatorId;
          if (!clients.has(operatorId)) clients.set(operatorId, new Set());
          clients.get(operatorId)!.add(socket);
        }
      } catch {}
    });

    socket.on('close', () => {
      if (operatorId) clients.get(operatorId)?.delete(socket);
    });
  });
}

export function broadcastOutput(operatorId: string, chunk: string) {
  const sockets = clients.get(operatorId);
  if (!sockets) return;
  const payload = JSON.stringify({ type: 'output', data: chunk });
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

export function broadcastQR(qrDataUrl: string) {
  const all = [...clients.values()].flatMap((s) => [...s]);
  const payload = JSON.stringify({ type: 'qr', data: qrDataUrl });
  for (const ws of all) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

export function broadcastBotStatus(platform: string, status: string) {
  const all = [...clients.values()].flatMap((s) => [...s]);
  const payload = JSON.stringify({ type: 'bot_status', platform, status });
  for (const ws of all) {
    if (ws.readyState === 1) ws.send(payload);
  }
}
