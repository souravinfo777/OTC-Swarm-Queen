export interface SocketMessage {
  type: string;
  timestamp: number;
  payload: any;
}

export type SocketStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

export class SwarmSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  public status: SocketStatus = 'DISCONNECTED';
  private reconnectInterval = 3000;
  // Retry forever: the dashboard must survive server restarts / network drops and
  // never freeze on stale data (a frozen chart looks like a dead chart).
  private maxReconnectAttempts = Number.POSITIVE_INFINITY;
  private currentAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Map<string, Array<(payload: any) => void>> = new Map();

  constructor(url?: string) {
    if (url) {
      this.url = url;
    } else if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.url = `${protocol}//${window.location.host}/ws`;
    } else {
      this.url = 'ws://127.0.0.1:8765/ws';
    }
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.status = 'RECONNECTING';
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.status = 'CONNECTED';
        this.currentAttempts = 0;
        this.emit('STATUS_CHANGE', { status: 'CONNECTED' });
      };

      this.ws.onmessage = (event) => {
        try {
          const data: SocketMessage = JSON.parse(event.data);
          this.emit(data.type, data.payload);
        } catch (e) {
          // Ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this.status = 'DISCONNECTED';
        this.emit('STATUS_CHANGE', { status: 'DISCONNECTED' });
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        this.status = 'DISCONNECTED';
        this.ws?.close();
      };
    } catch (e) {
      this.status = 'DISCONNECTED';
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.currentAttempts < this.maxReconnectAttempts) {
      this.currentAttempts++;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectInterval);
    }
  }

  public on(type: string, callback: (payload: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);
  }

  public off(type: string, callback: (payload: any) => void) {
    if (!this.listeners.has(type)) return;
    const filtered = this.listeners.get(type)!.filter((cb) => cb !== callback);
    this.listeners.set(type, filtered);
  }

  private emit(type: string, payload: any) {
    const list = this.listeners.get(type);
    if (list) {
      list.forEach((cb) => cb(payload));
    }
  }

  public send(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
    }
  }

  public disconnect() {
    this.currentAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.status = 'DISCONNECTED';
  }
}
