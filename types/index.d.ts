type SocketData = string | ArrayBufferLike | Blob | ArrayBufferView;
type CallbackFunction = ((event?: any) => void) | null;
type HeartbeatFunction = (() => SocketData) | null;
interface WebSocketCallbacks {
    onConnected: CallbackFunction;
    onMessage: CallbackFunction;
    onClosed: CallbackFunction;
    onError?: CallbackFunction;
    onSendError?: CallbackFunction;
    onMessageTimeout?: CallbackFunction;
    onHeartbeatTimeout?: CallbackFunction;
    onReconnecting?: CallbackFunction;
    onReconnectFailed?: CallbackFunction;
    getHeartbeat?: HeartbeatFunction;
}
interface WebSocketOptions {
    url: string;
    reconnectAttempts?: number;
    reconnectInterval?: number;
    messageTimeout?: number;
    heartbeatInterval?: number;
    heartbeatTimeout?: number;
    binaryType?: BinaryType;
}
export declare class WebSocketClient {
    private ws;
    private options;
    private callbacks;
    private reconnectCount;
    private timers;
    constructor(options: WebSocketOptions, callbacks: WebSocketCallbacks);
    private connect;
    private setupEventListeners;
    private handleConnectionError;
    private startHeartbeat;
    private resetHeartbeat;
    private clearTimer;
    private clearAllTimers;
    send(data: SocketData): void;
    private startMessageTimeout;
    isConnected(): boolean;
    close(): void;
    destroy(): void;
}
declare class WebSocketManager {
    private static wsInstances;
    static createWebSocket(channelId: number, options: WebSocketOptions, callbacks: WebSocketCallbacks): void;
    static removeWebSocket(channelId: number): void;
    static sendWebSocketMessage(channelId: number, data: SocketData): void;
}
export type { WebSocketOptions, WebSocketCallbacks, SocketData };
export declare const createWebSocket: typeof WebSocketManager.createWebSocket, removeWebSocket: typeof WebSocketManager.removeWebSocket, sendWebSocketMessage: typeof WebSocketManager.sendWebSocketMessage;
declare const _default: {
    WebSocketClient: typeof WebSocketClient;
    createWebSocket: typeof WebSocketManager.createWebSocket;
    removeWebSocket: typeof WebSocketManager.removeWebSocket;
    sendWebSocketMessage: typeof WebSocketManager.sendWebSocketMessage;
};
export default _default;
