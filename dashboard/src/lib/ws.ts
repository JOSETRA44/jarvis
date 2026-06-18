type WSHandler = (msg: WSMessage) => void;

export interface WSMessage {
  type: 'output' | 'qr' | 'bot_status';
  data?: string;
  platform?: string;
  status?: string;
}

let ws: WebSocket | null = null;
const handlers: WSHandler[] = [];

export function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/terminal`);

  ws.onmessage = (e) => {
    try {
      const msg: WSMessage = JSON.parse(e.data);
      handlers.forEach((h) => h(msg));
    } catch {}
  };

  ws.onclose = () => {
    setTimeout(connectWS, 3000);
  };
}

export function onWSMessage(handler: WSHandler) {
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

export function subscribeOperator(operatorId: string) {
  ws?.send(JSON.stringify({ type: 'subscribe', operatorId }));
}
