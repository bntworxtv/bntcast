import { Server } from 'http';
import WebSocket from 'ws';

class WebSocketManager {
  private wss: WebSocket.Server | null = null;
  private clients: Map<string, Set<WebSocket>> = new Map();

  init(server: Server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });
    this.wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribe' && msg.stationId) {
            if (!this.clients.has(msg.stationId)) {
              this.clients.set(msg.stationId, new Set());
            }
            this.clients.get(msg.stationId)!.add(ws);
            (ws as any).__stationId = msg.stationId;
          }
        } catch {}
      });
      ws.on('close', () => {
        const stationId = (ws as any).__stationId;
        if (stationId && this.clients.has(stationId)) {
          this.clients.get(stationId)!.delete(ws);
        }
      });
    });
  }

  broadcast(stationId: string, event: string, data: any) {
    const clients = this.clients.get(stationId);
    if (!clients) return;
    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  broadcastAll(event: string, data: any) {
    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    this.wss?.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

export const wsManager = new WebSocketManager();
