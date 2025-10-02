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
    binaryType?: BinaryType; // 二进制类型
}

export class WebSocketClient {
    private ws: WebSocket | null = null;
    private options: WebSocketOptions;
    private callbacks: WebSocketCallbacks;
    private reconnectCount: number = 0;
    private isHandlingError: boolean = false; // 防止重复处理连接错误
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

        if (this.options.heartbeatInterval === this.options.heartbeatTimeout) {
            console.warn("heartbeatInterval,heartbeatTimeout相同，heartbeatTimeout自动加3秒");
            this.options.heartbeatTimeout = this.options.heartbeatTimeout! + 3000;
        }

        this.connect();
    }

    private connect(): void {
        try {
            if (this.ws) {
                this.ws.onopen = null;
                this.ws.onmessage = null;
                this.ws.onclose = null;
                this.ws.onerror = null;
                if (this.ws.readyState !== WebSocket.CLOSED) {
                    this.ws.close();
                }
            }
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
            this.isHandlingError = false;
            this.startHeartbeat();
            this.resetHeartbeat();
            this.callbacks.onConnected?.(null);
        };

        this.ws.onmessage = (event) => {
            this.clearTimer("messageTimeout");
            this.resetHeartbeat();
            this.callbacks.onMessage?.(event.data);
        };

        this.ws.onclose = () => {
            if (this.isHandlingError) return;
            this.isHandlingError = true;

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
            this.clearTimer("reconnect");
            this.timers.reconnect = setTimeout(() => this.connect(), this.options.reconnectInterval);
        } else {
            this.callbacks.onReconnectFailed?.(null);
            this.ws = null;
        }
    }

    private startHeartbeat(): void {
        if (!this.callbacks.getHeartbeat) return;
        this.clearTimer("heartbeatSend");
        this.timers.heartbeatSend = setInterval(() => {
            if (this.isConnected()) {
                const heartbeatData = this.callbacks.getHeartbeat!();
                this.sendHeartbeat(heartbeatData);
            }
        }, this.options.heartbeatInterval);
    }

    private resetHeartbeat(): void {
        if (!this.callbacks.getHeartbeat) return;

        this.clearTimer("heartbeatCheck");

        this.timers.heartbeatCheck = setTimeout(() => {
            this.handleTimeoutAndReconnect(this.callbacks.onHeartbeatTimeout);
        }, this.options.heartbeatTimeout);
    }

    private sendHeartbeat(data: SocketData): void {
        if (this.isConnected()) {
            this.ws!.send(data);
        }
    }

    private handleTimeoutAndReconnect(timeoutCallback?: CallbackFunction): void {
        if (this.isHandlingError) return;
        this.isHandlingError = true;
        timeoutCallback?.(null);
        if (this.ws) this.ws.onclose = null;
        this.clearAllTimers();
        this.callbacks?.onClosed?.(null);
        this.ws?.close();
        this.handleConnectionError();
    }

    private clearTimer(timerName: keyof typeof this.timers): void {
        if (this.timers[timerName]) {
            if (timerName === "heartbeatSend") {
                clearInterval(this.timers[timerName]);
            } else {
                clearTimeout(this.timers[timerName]);
            }
            this.timers[timerName] = null;
        }
    }

    private clearAllTimers(): void {
        Object.keys(this.timers).forEach((timer) => {
            this.clearTimer(timer as keyof typeof this.timers);
        });
    }

    private startMessageTimeout(): void {
        this.clearTimer("messageTimeout");
        this.timers.messageTimeout = setTimeout(() => {
            this.handleTimeoutAndReconnect(this.callbacks.onMessageTimeout);
        }, this.options.messageTimeout);
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
        this.startMessageTimeout();
        return true;
    }

    public destroy(): void {
        this.clearAllTimers();
        if (this.ws) {
            this.ws.onclose = null;
            if (this.ws.readyState !== WebSocket.CLOSED) {
                this.ws.close();
            }
            this.callbacks.onClosed?.(null);
        }
        this.ws = null;
        this.callbacks = {} as WebSocketCallbacks;
    }

    public getWebSocket(): WebSocket | null {
        return this.ws;
    }
}

// 创建一个单例管理器
export const WS = {
    wsInstances: new Map<number, WebSocketClient>(),

    createWebSocket(channelId: number, options: WebSocketOptions, callbacks: WebSocketCallbacks): void {
        if (this.wsInstances.has(channelId)) {
            this.wsInstances.get(channelId)!.destroy();
        }
        this.wsInstances.set(channelId, new WebSocketClient(options, callbacks));
    },

    removeWebSocket(channelId: number): void {
        if (this.wsInstances.has(channelId)) {
            this.wsInstances.get(channelId)!.destroy();
            this.wsInstances.delete(channelId);
        }
    },

    sendWebSocketMessage(channelId: number, data: SocketData): boolean {
        const ws = this.wsInstances.get(channelId);
        if (ws) {
            return ws.send(data);
        }
        return false;
    },

    getWebSocketInstance(channelId: number): WebSocket | null {
        const ws = this.wsInstances.get(channelId);
        return ws?.getWebSocket() ?? null;
    }
};

// 导出类型
export type { SocketData, WebSocketCallbacks, WebSocketOptions };

// 导出所有方法
export const createWebSocket = WS.createWebSocket.bind(WS);
export const removeWebSocket = WS.removeWebSocket.bind(WS);
export const sendWebSocketMessage = WS.sendWebSocketMessage.bind(WS);
export const getWebSocketInstance = WS.getWebSocketInstance.bind(WS);

// 默认导出
export default {
    WebSocketClient,
    createWebSocket,
    removeWebSocket,
    sendWebSocketMessage,
    getWebSocketInstance
};
