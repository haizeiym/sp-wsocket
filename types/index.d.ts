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
    reconnectAttempts?: number;
    reconnectInterval?: number;
    heartbeatInterval?: number;
    heartbeatTimeout?: number;
    randomTime?: number;
    binaryType?: BinaryType;
    enableMessageBuffer?: boolean;
}
export declare class WebSocketClient {
    private ws;
    private options;
    private callbacks;
    private reconnectCount;
    private isConnecting;
    private messageQueue;
    private timers;
    constructor(options: WebSocketOptions, callbacks: WebSocketCallbacks);
    private connect;
    private setupEventListeners;
    private handleConnectionError;
    private startHeartbeat;
    private resetHeartbeat;
    private sendHeartbeat;
    private handleTimeoutAndReconnect;
    private clearTimer;
    private clearAllTimers;
    private cleanupConnection;
    private cleanupOldConnection;
    private isConnected;
    send(data: SocketData): boolean;
    private flushMessageQueue;
    destroy(): void;
    getWebSocket(): WebSocket | null;
}
export declare const WS: {
    wsInstances: Map<number, WebSocketClient>;
    createWebSocket(channelId: number, options: WebSocketOptions, callbacks: WebSocketCallbacks): void;
    removeWebSocket(channelId: number): void;
    sendWebSocketMessage(channelId: number, data: SocketData): boolean;
    getWebSocketInstance(channelId: number): WebSocket | null;
};
export type { SocketData, WebSocketCallbacks, WebSocketOptions };
export declare const createWebSocket: (channelId: number, options: WebSocketOptions, callbacks: WebSocketCallbacks) => void;
export declare const removeWebSocket: (channelId: number) => void;
export declare const sendWebSocketMessage: (channelId: number, data: SocketData) => boolean;
export declare const getWebSocketInstance: (channelId: number) => WebSocket | null;
declare const _default: {
    WebSocketClient: typeof WebSocketClient;
    createWebSocket: (channelId: number, options: WebSocketOptions, callbacks: WebSocketCallbacks) => void;
    removeWebSocket: (channelId: number) => void;
    sendWebSocketMessage: (channelId: number, data: SocketData) => boolean;
    getWebSocketInstance: (channelId: number) => WebSocket | null;
};
export default _default;
