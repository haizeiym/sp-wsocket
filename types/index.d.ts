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
    send(data: SocketData): boolean;
    private startMessageTimeout;
    isConnected(): boolean;
    close(): void;
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
export type { WebSocketOptions, WebSocketCallbacks, SocketData };
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
