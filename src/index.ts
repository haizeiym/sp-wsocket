type SocketData = string | ArrayBufferLike | Blob | ArrayBufferView;
type CallbackFunction = ((event?: any) => void) | null;
type HeartbeatFunction = (() => SocketData) | null;

interface WebSocketCallbacks {
    onConnected: CallbackFunction; // 连接成功回调
    onMessage: CallbackFunction; // 消息回调
    onClosed: CallbackFunction; // 关闭回调
    onError?: CallbackFunction; // 错误回调
    onSendError?: CallbackFunction; // 发送消息错误回调
    onMessageTimeout?: CallbackFunction; // 消息超时回调
    onHeartbeatTimeout?: CallbackFunction; // 心跳超时回调
    onReconnecting?: CallbackFunction; // 重连中回调
    onReconnectFailed?: CallbackFunction; // 重连失败回调
    getHeartbeat?: HeartbeatFunction; // 获取心跳包数据
}

interface WebSocketOptions {
    url: string;
    reconnectAttempts?: number; // 重连次数
    reconnectInterval?: number; // 重连间隔(ms)
    messageTimeout?: number; // 消息超时时间(ms)
    heartbeatInterval?: number; // 心跳发送间隔(ms)
    heartbeatTimeout?: number; // 心跳超时时间(ms)
    binaryType?: BinaryType; // 二进制数据类型
}

export class WebSocketClient {
    private ws: WebSocket | null = null;
    private options: WebSocketOptions;
    private callbacks: WebSocketCallbacks;
    private reconnectCount: number = 0;
    private timers = {
        heartbeatSend: null as any,
        heartbeatCheck: null as any,
        messageTimeout: null as any,
        reconnect: null as any
    };

    constructor(options: WebSocketOptions, callbacks: WebSocketCallbacks) {
        this.options = {
            reconnectAttempts: 3,
            reconnectInterval: 5000,
            messageTimeout: 5000,
            heartbeatInterval: 10000,
            heartbeatTimeout: 15000,
            binaryType: "arraybuffer",
            ...options
        };
        this.callbacks = callbacks;
        this.connect();
    }

    private connect(): void {
        try {
            this.ws = new WebSocket(this.options.url);
            this.ws.binaryType = this.options.binaryType!;
            this.setupEventListeners();
        } catch (error) {
            console.error("WebSocket connection error:", error);
            this.handleConnectionError();
        }
    }

    private setupEventListeners(): void {
        if (!this.ws) return;

        this.ws.onopen = () => {
            this.reconnectCount = 0;
            this.startHeartbeat();
            this.callbacks.onConnected?.(null);
        };

        this.ws.onmessage = (event) => {
            this.clearTimer("messageTimeout");
            this.resetHeartbeat();
            this.callbacks.onMessage?.(event.data);
        };

        this.ws.onclose = () => {
            this.clearAllTimers();
            this.callbacks.onClosed?.(null);
            this.handleConnectionError();
        };

        this.ws.onerror = (error) => {
            this.callbacks.onError?.(error);
        };
    }

    private handleConnectionError(): void {
        if (this.reconnectCount < this.options.reconnectAttempts!) {
            this.reconnectCount++;
            this.callbacks.onReconnecting?.(this.options.reconnectAttempts! - this.reconnectCount);
            this.timers.reconnect = setTimeout(() => this.connect(), this.options.reconnectInterval);
        } else {
            this.callbacks.onReconnectFailed?.(null);
        }
    }

    private startHeartbeat(): void {
        if (!this.callbacks.getHeartbeat) return;

        this.timers.heartbeatSend = setInterval(() => {
            if (this.isConnected()) {
                const heartbeatData = this.callbacks.getHeartbeat!();
                this.send(heartbeatData);
            }
        }, this.options.heartbeatInterval);

        this.timers.heartbeatCheck = setInterval(() => {
            this.callbacks.onHeartbeatTimeout?.();
            this.close();
        }, this.options.heartbeatTimeout);
    }

    private resetHeartbeat(): void {
        if (this.timers.heartbeatCheck) {
            clearTimeout(this.timers.heartbeatCheck);
            this.timers.heartbeatCheck = setTimeout(() => {
                this.callbacks.onHeartbeatTimeout?.();
                this.close();
            }, this.options.heartbeatTimeout);
        }
    }

    private clearTimer(timerName: keyof typeof this.timers): void {
        if (this.timers[timerName]) {
            clearTimeout(this.timers[timerName]);
            this.timers[timerName] = null;
        }
    }

    private clearAllTimers(): void {
        Object.keys(this.timers).forEach((timer) => {
            this.clearTimer(timer as keyof typeof this.timers);
        });
    }

    public send(data: SocketData): void {
        if (!this.isConnected()) {
            this.callbacks.onSendError?.(this.ws?.readyState ?? -1);
            return;
        }

        try {
            this.ws!.send(data);
            this.startMessageTimeout();
        } catch (error) {
            console.error("Error sending message:", error);
            this.callbacks.onSendError?.(error);
        }
    }

    private startMessageTimeout(): void {
        this.clearTimer("messageTimeout");
        this.timers.messageTimeout = setTimeout(() => {
            this.callbacks.onMessageTimeout?.();
        }, this.options.messageTimeout);
    }

    public isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    public close(): void {
        this.clearAllTimers();
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
            this.ws.close();
        }
    }

    public destroy(): void {
        this.close();
        this.ws = null;
        this.callbacks = {} as WebSocketCallbacks;
    }
}

// 工厂函数和管理器
const wsInstances = new Map<number, WebSocketClient>();

export const createWebSocket = (channelId: number, options: WebSocketOptions, callbacks: WebSocketCallbacks): void => {
    if (wsInstances.has(channelId)) {
        wsInstances.get(channelId)!.destroy();
    }
    wsInstances.set(channelId, new WebSocketClient(options, callbacks));
};

export const removeWebSocket = (channelId: number): void => {
    if (wsInstances.has(channelId)) {
        wsInstances.get(channelId)!.destroy();
        wsInstances.delete(channelId);
    }
};

export const sendWebSocketMessage = (channelId: number, data: SocketData): void => {
    const ws = wsInstances.get(channelId);
    if (ws) {
        ws.send(data);
    }
};

export type { WebSocketOptions, WebSocketCallbacks, SocketData };
