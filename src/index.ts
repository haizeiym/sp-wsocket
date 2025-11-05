type SocketData = string | ArrayBufferLike | Blob | ArrayBufferView;
type CallbackFunction = ((event?: any) => void) | null;
type HeartbeatFunction = (() => SocketData) | null;

interface WebSocketCallbacks {
  onConnected: CallbackFunction;
  onMessage: CallbackFunction;
  onClosed: CallbackFunction;
  onError?: CallbackFunction;
  onSendError?: CallbackFunction;
  onHeartbeatTimeout?: CallbackFunction;
  onReconnecting?: CallbackFunction;
  onReconnectFailed?: CallbackFunction;
  getHeartbeat?: HeartbeatFunction;
}

interface WebSocketOptions {
  url: string;
  reconnectAttempts?: number; // 最大重连次数
  reconnectInterval?: number; // 基础重连间隔
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  randomTime?: number;
  binaryType?: BinaryType;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private options: WebSocketOptions;
  private callbacks: WebSocketCallbacks;
  private reconnectCount = 0;
  private isConnecting = false;
  private isReconnecting = false;

  private timers: Record<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null> = {
    heartbeatSend: null,
    heartbeatCheck: null,
    reconnect: null
  };

  constructor(options: WebSocketOptions, callbacks: WebSocketCallbacks) {
    this.options = {
      reconnectAttempts: 3,
      reconnectInterval: 5000,
      heartbeatInterval: 10000,
      heartbeatTimeout: 15000,
      randomTime: 2,
      binaryType: "arraybuffer",
      ...options
    };
    this.callbacks = callbacks;

    if (this.options.heartbeatInterval === this.options.heartbeatTimeout) {
      this.options.heartbeatTimeout! += 3000;
    }

    this.connect();
  }

  private connect(): void {
    if (this.isConnecting) return;
    this.isConnecting = true;
    this.clearAllTimers();

    if (this.ws) {
      this.cleanupOldConnection(this.ws);
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(this.options.url);
      this.ws.binaryType = this.options.binaryType!;
      this.setupEventListeners();
    } catch (err) {
      console.error("WebSocket 初始化失败:", err);
      this.isConnecting = false;
      // 不直接调用 connect()，重连由 onclose 控制
    }
  }

  private setupEventListeners(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.isConnecting = false;
      this.isReconnecting = false;
      this.reconnectCount = 0;
      this.startHeartbeat();
      this.resetHeartbeat();
      this.callbacks.onConnected?.(null);
    };

    this.ws.onmessage = (event) => {
      this.resetHeartbeat();
      this.callbacks.onMessage?.(event.data);
    };

    this.ws.onclose = () => {
      this.isConnecting = false;
      this.clearAllTimers();
      this.callbacks.onClosed?.(null);

      // 统一由 onclose 触发重连
      if (!this.isReconnecting && this.reconnectCount < this.options.reconnectAttempts!) {
        this.isReconnecting = true;
        this.reconnectCount++;
        this.callbacks.onReconnecting?.(this.options.reconnectAttempts! - this.reconnectCount);

        const baseDelay = this.options.reconnectInterval!;
        const backoffDelay = Math.min(baseDelay * Math.pow(1.5, this.reconnectCount - 1), 30000);
        const randomDelay = Math.random() * this.options.randomTime! * 1000;
        const totalDelay = backoffDelay + randomDelay;

        this.timers.reconnect = setTimeout(() => {
          this.isReconnecting = false;
          this.connect();
        }, totalDelay);
      } else if (this.reconnectCount >= this.options.reconnectAttempts!) {
        this.callbacks.onReconnectFailed?.(null);
        this.ws = null;
        setTimeout(() => (this.reconnectCount = 0), 30000);
      }
    };

    this.ws.onerror = (error) => {
      this.callbacks.onError?.(error);
      // 不触发 connect()，由 onclose 控制
    };
  }

  private startHeartbeat(): void {
    if (!this.callbacks.getHeartbeat) return;
    this.clearTimer("heartbeatSend");
    this.timers.heartbeatSend = setInterval(() => {
      if (this.isConnected()) this.ws!.send(this.callbacks.getHeartbeat!());
    }, this.options.heartbeatInterval! + Math.random() * this.options.randomTime!);
  }

  private resetHeartbeat(): void {
    if (!this.callbacks.getHeartbeat) return;
    this.clearTimer("heartbeatCheck");
    this.timers.heartbeatCheck = setTimeout(() => {
      this.callbacks.onHeartbeatTimeout?.(null);
      this.cleanupConnection();
      // 重连由 onclose 控制
    }, this.options.heartbeatTimeout! + Math.random() * this.options.randomTime!);
  }

  private clearTimer(name: keyof typeof this.timers): void {
    const t = this.timers[name];
    if (!t) return;
    if (name === "heartbeatSend") clearInterval(t as ReturnType<typeof setInterval>);
    else clearTimeout(t as ReturnType<typeof setTimeout>);
    this.timers[name] = null;
  }

  private clearAllTimers(): void {
    Object.keys(this.timers).forEach((k) => this.clearTimer(k as keyof typeof this.timers));
  }

  private cleanupConnection(): void {
    this.clearAllTimers();
    if (this.ws) this.cleanupOldConnection(this.ws);
  }

  private cleanupOldConnection(ws: WebSocket): void {
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) ws.close();
  }

  private isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public send(data: SocketData): boolean {
    if (!this.isConnected()) {
      this.callbacks.onSendError?.(this.ws?.readyState ?? -1);
      return false;
    }
    this.ws!.send(data);
    return true;
  }

  public destroy(): void {
    this.isConnecting = false;
    this.isReconnecting = false;
    this.cleanupConnection();
    this.callbacks.onClosed?.(null);
    this.ws = null;
    this.callbacks = {} as WebSocketCallbacks;
  }

  public getWebSocket(): WebSocket | null {
    return this.ws;
  }
}

export const WS = {
  wsInstances: new Map<number, WebSocketClient>(),
  createWebSocket(channelId: number, options: WebSocketOptions, callbacks: WebSocketCallbacks) {
    if (this.wsInstances.has(channelId)) this.wsInstances.get(channelId)!.destroy();
    this.wsInstances.set(channelId, new WebSocketClient(options, callbacks));
  },
  removeWebSocket(channelId: number) {
    const ws = this.wsInstances.get(channelId);
    if (ws) {
      ws.destroy();
      this.wsInstances.delete(channelId);
    }
  },
  sendWebSocketMessage(channelId: number, data: SocketData): boolean {
    const ws = this.wsInstances.get(channelId);
    return ws ? ws.send(data) : false;
  },
  getWebSocketInstance(channelId: number): WebSocket | null {
    return this.wsInstances.get(channelId)?.getWebSocket() ?? null;
  }
};

export type { SocketData, WebSocketCallbacks, WebSocketOptions };
export const createWebSocket = WS.createWebSocket.bind(WS);
export const removeWebSocket = WS.removeWebSocket.bind(WS);
export const sendWebSocketMessage = WS.sendWebSocketMessage.bind(WS);
export const getWebSocketInstance = WS.getWebSocketInstance.bind(WS);

export default {
  WebSocketClient,
  createWebSocket,
  removeWebSocket,
  sendWebSocketMessage,
  getWebSocketInstance
};
