type SocketData = string | ArrayBufferLike | Blob | ArrayBufferView;
type CallbackFunction = ((event?: any) => void) | null;
type HeartbeatFunction = (() => SocketData) | null;

interface WebSocketCallbacks {
    onConnected: CallbackFunction; // 连接成功回调
    onMessage: CallbackFunction; // 消息回调
    onClosed: CallbackFunction; // 关闭回调
    onError?: CallbackFunction; // 错误回调
    onSendError?: CallbackFunction; // 发送消息错误回调
    onHeartbeatTimeout?: CallbackFunction; // 心跳超时回调
    onReconnecting?: CallbackFunction; // 重连中回调
    onReconnectFailed?: CallbackFunction; // 重连失败回调
    getHeartbeat?: HeartbeatFunction; // 获取心跳包数据
}

interface WebSocketOptions {
    url: string;
    reconnectAttempts?: number; // 重连次数
    reconnectInterval?: number; // 重连间隔(ms)
    heartbeatInterval?: number; // 心跳发送间隔(ms)
    heartbeatTimeout?: number; // 心跳超时时间(ms)
    randomTime?: number; // 随机时间(s)
    binaryType?: BinaryType; // 二进制类型
    enableMessageBuffer?: boolean; // 是否启用消息缓冲
}

export class WebSocketClient {
    private ws: WebSocket | null = null;
    private options: WebSocketOptions;
    private callbacks: WebSocketCallbacks;
    private reconnectCount: number = 0;
    private isConnecting: boolean = false; 
    private messageQueue: SocketData[] = []; // 消息缓冲队列
    private timers = {
        heartbeatSend: null as any,
        heartbeatCheck: null as any,
        reconnect: null as any
    };

    constructor(options: WebSocketOptions, callbacks: WebSocketCallbacks) {
        this.options = {
            reconnectAttempts: 3,
            reconnectInterval: 5000,
            heartbeatInterval: 10000,
            heartbeatTimeout: 15000,
            randomTime: 2,
            binaryType: "arraybuffer",
            enableMessageBuffer: false, // 默认关闭消息缓冲
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
        // 防止重复连接
        if (this.isConnecting) {
            console.warn("WebSocket is already connecting, skipping duplicate connect call");
            return;
        }

        try {
            this.isConnecting = true;

            // 清理旧连接和定时器
            this.clearAllTimers();

            if (this.ws) {
                const oldWs = this.ws;
                this.ws = null;
                this.cleanupOldConnection(oldWs);
            }

            // 创建新连接
            this.ws = new WebSocket(this.options.url);
            this.ws.binaryType = this.options.binaryType!;
            this.setupEventListeners();
        } catch (error) {
            console.error("WebSocket connection error:", error);
            this.isConnecting = false;
            this.handleConnectionError();
        }
    }

    private setupEventListeners(): void {
        if (!this.ws) return;

        this.ws.onopen = () => {
            this.isConnecting = false;
            
            // 成功建立连接后重置重连计数，确保后续断开可以重新开始计数
            this.reconnectCount = 0;
            
            // 如果启用了消息缓冲，发送缓冲队列中的消息
            if (this.options.enableMessageBuffer) {
                this.flushMessageQueue();
            }
            
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

            if (this.reconnectCount === 0) {
                this.callbacks.onClosed?.(null);
            }

            // 只有在没有重连定时器时才处理，避免重复调用
            if (!this.timers.reconnect) {
                this.handleConnectionError();
            }
        };

        this.ws.onerror = (error) => {
            // 不在这里重置 isConnecting，等待 onclose 处理
            // 因为 onerror 之后一定会触发 onclose
            this.callbacks.onError?.(error);
        };
    }

    private handleConnectionError(): void {
        if (this.reconnectCount < this.options.reconnectAttempts!) {
            this.reconnectCount++;
            this.callbacks.onReconnecting?.(this.options.reconnectAttempts! - this.reconnectCount);
            this.clearTimer("reconnect");
            
            // 指数退避重连策略
            const baseDelay = this.options.reconnectInterval!;
            const backoffDelay = Math.min(baseDelay * Math.pow(1.5, this.reconnectCount - 1), 30000); // 最大30秒
            const randomDelay = Math.random() * this.options.randomTime! * 1000;
            const totalDelay = backoffDelay + randomDelay;
            
            this.timers.reconnect = setTimeout(() => {
                this.connect();
            }, totalDelay);
        } else {
            this.callbacks.onReconnectFailed?.(null);
            this.ws = null;
            
            // 30秒后重置重连次数，允许网络恢复后重连
            setTimeout(() => {
                this.reconnectCount = 0;
            }, 30000);
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
        }, this.options.heartbeatInterval! + Math.random() * this.options.randomTime!);
    }

    private resetHeartbeat(): void {
        if (!this.callbacks.getHeartbeat) return;

        this.clearTimer("heartbeatCheck");

        this.timers.heartbeatCheck = setTimeout(() => {
            this.handleTimeoutAndReconnect(this.callbacks.onHeartbeatTimeout);
        }, this.options.heartbeatTimeout! + Math.random() * this.options.randomTime!);
    }

    private sendHeartbeat(data: SocketData): void {
        if (this.isConnected()) {
            this.ws!.send(data);
        }
    }

    private handleTimeoutAndReconnect(timeoutCallback?: CallbackFunction): void {
        timeoutCallback?.(null);
        this.cleanupConnection();
        this.callbacks?.onClosed?.(null);
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

    private cleanupConnection(): void {
        this.clearAllTimers();
        if (this.ws) {
            this.cleanupOldConnection(this.ws);
        }
    }

    private cleanupOldConnection(ws: WebSocket): void {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
            ws.close();
        }
    }


    private isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    public send(data: SocketData): boolean {
        if (!this.isConnected()) {
            // 如果启用了消息缓冲，将消息加入缓冲队列
            if (this.options.enableMessageBuffer) {
                this.messageQueue.push(data);
            }
            this.callbacks.onSendError?.(this.ws?.readyState ?? -1);
            return false;
        }

        this.ws!.send(data);
        return true;
    }

    private flushMessageQueue(): void {
        while (this.messageQueue.length > 0 && this.isConnected()) {
            const message = this.messageQueue.shift();
            if (message) {
                this.ws!.send(message);
            }
        }
    }

    public destroy(): void {
        this.isConnecting = false;
        this.cleanupConnection();
        this.callbacks.onClosed?.(null);
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
