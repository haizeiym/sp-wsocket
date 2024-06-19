const socket: { [key: number]: baseWs } = Object.create(null);

type socketData = (string | ArrayBufferLike | Blob | ArrayBufferView);

export interface socketFn {
    onConnected(event?: any): void;                             //连接回调
    onMessage(event: any): void;                                //消息回调
    onClosed(event?: any): void;                                //关闭回调

    onError?(event?: any): void;                                //错误回调
    errorSendFn?(readyState?: number): void;                    //网络状态错误发送消息时回调
    msgTimeOutFn?(): void;                                      //接受消息超时回调
    heartTimeOutFn?(): void;                                    //接受消息超时回调
    reconnectFn?(rCount?: number): void;                        //重连
    reconnectEndFn?(): void;                                    //重连结束回调

    getHearbeat?(): socketData;                                 //心跳包
}

export interface socketOp {
    url: string;
    autoReconnect?: number;
    reconnetTimeOut?: number;
    msgTimeOut?: number;
    heartSendTime?: number;
    heartTimeOut?: number;
    binaryType?: BinaryType;
}

class baseWs {
    private _heartSendTime: number = 10000;     //心跳发送时间
    private _heartTimeOut: number = 15000;      //心跳超时时间
    private _msgTimeOut: number = 3000;         //消息超时时间
    private _reconnetTimeOut: number = 5000;    //重连间隔
    private _autoReconnect: number = 0;         //重连次数

    private _heartSendTimer: any = null;        //心跳定时器
    private _heartTimerOut: any = null;         //心跳超时检测
    private _msgTimerOut: any = null;           //消息超时检测
    private _reconnectTimer: any = null;        //重连定时器

    private _ws: WebSocket;
    private _op: socketOp;

    private _msgTimeOutFn: () => void;
    private _heartTimeOutFn: () => void;
    private _errorSendFn: (readyState?: number) => void;
    private _reconnectEndFn: () => void;
    private _reconnectFn: (rCount?: number) => void;

    private _hearDataFn: () => socketData;

    private _onMessage: (event: any) => void;
    private _onConnected: (event?: any) => void;
    private _onClosed: (event?: any) => void;
    private _onError: (event?: any) => void;

    public createWs(op: socketOp, fn: socketFn) {
        this._op = op;

        this._onMessage = fn.onMessage && fn.onMessage.bind(fn);
        this._onConnected = fn.onConnected && fn.onConnected.bind(fn);

        this._onClosed = fn.onClosed && fn.onClosed.bind(fn);
        this._onError = fn.onError && fn.onError.bind(fn);

        this._hearDataFn = fn.getHearbeat && fn.getHearbeat.bind(fn);

        this._errorSendFn = fn.errorSendFn && fn.errorSendFn.bind(fn);
        this._msgTimeOutFn = fn.msgTimeOutFn && fn.msgTimeOutFn.bind(fn);
        this._heartTimeOutFn = fn.heartTimeOutFn && fn.heartTimeOutFn.bind(fn);
        this._reconnectFn = fn.reconnectFn && fn.reconnectFn.bind(fn);
        this._reconnectEndFn = fn.reconnectEndFn && fn.reconnectEndFn.bind(fn);

        if (op.heartSendTime) this._heartSendTime = op.heartSendTime;
        if (op.heartTimeOut) this._heartTimeOut = op.heartTimeOut;
        if (op.msgTimeOut) this._msgTimeOut = op.msgTimeOut;
        if (op.reconnetTimeOut) this._reconnetTimeOut = op.reconnetTimeOut;
        if (this._heartSendTime >= this._heartTimeOut) this._heartTimeOut = this._heartSendTime + 5000;

        this._nWs();
    }

    private _nWs() {
        if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) return;
        this._ws = new WebSocket(this._op.url);
        this._ws.binaryType = this._op.binaryType ? this._op.binaryType : "arraybuffer";
        this._ws.onopen = this._onopen.bind(this);
        this._ws.onmessage = this._onmessage.bind(this);
        this._ws.onclose = this._onclose.bind(this);
        this._ws.onerror = this._onerror.bind(this);
    }

    private _onmessage(event: MessageEvent) {
        this._clearTimer();
        this._resetHeartTimerOut();         //重置心跳消息未响应
        this._resetHearSendTimer();         //重置心跳
        this._onMessage && this._onMessage(event.data);
    }

    private _onopen(event: MessageEvent) {
        if (this._op && this._op.autoReconnect) this._autoReconnect = this._op.autoReconnect;
        this._clearTimer();
        this._onConnected && this._onConnected(event);
    }

    private _onclose(event: MessageEvent) {
        this._clearTimer();
        this._onClosed && this._onClosed(event);
        this._autoReconnectFn();
    }

    private _autoReconnectFn() {
        this._clearReconnectTimer();
        if (this._autoReconnect <= 0) return;
        this._autoReconnect--;
        if (this._autoReconnect <= 0) {
            this._reconnectEndFn && this._reconnectEndFn();
            return;
        }
        this._nWs();
        this._reconnectFn && this._reconnectFn(this._autoReconnect);
        this._reconnectTimer = setTimeout(() => {
            this._autoReconnectFn();
        }, this._reconnetTimeOut);
    }

    private _onerror(data: any) {
        this._autoReconnect = 0;
        this._clearTimer();
        this._onError && this._onError(data);
    }

    private _resetHearSendTimer() {
        this._clearHeartSendTimer();
        this._heartSendTimer = setTimeout(() => {
            this._hearDataFn && this._ws && this._ws.readyState == WebSocket.OPEN && this._ws.send(this._hearDataFn());
        }, this._heartSendTime);
    }

    private _resetHeartTimerOut() {
        this._clearHeartTimerOut();
        this._heartTimerOut = setTimeout(() => {
            this._closeWs();
            this._heartTimeOutFn && this._heartTimeOutFn();
        }, this._heartTimeOut);
    }

    private _resetMsgTimerOut() {
        this._clearMsgTimerOut();
        this._msgTimerOut = setTimeout(() => {
            this._closeWs();
            this._msgTimeOutFn && this._msgTimeOutFn();
        }, this._msgTimeOut);
    }

    private _clearHeartSendTimer() {
        if (this._heartSendTimer) clearTimeout(this._heartSendTimer);
    }

    private _clearHeartTimerOut() {
        if (this._heartTimerOut) clearTimeout(this._heartTimerOut);
    }

    private _clearMsgTimerOut() {
        if (this._msgTimerOut) clearTimeout(this._msgTimerOut);
    }

    private _clearReconnectTimer() {
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    }

    private _clearTimer() {
        this._clearHeartSendTimer();
        this._clearHeartTimerOut();
        this._clearMsgTimerOut();
        this._clearReconnectTimer();
    }

    private _closeWs() {
        this._clearTimer();
        if (!this._ws || this._ws.readyState === WebSocket.CLOSED || this._ws.readyState === WebSocket.CLOSING) return;
        this._ws.close();
    }

    public remove() {
        this._autoReconnect = 0;
        this._heartSendTime = 0;
        this._heartTimeOut = 0;
        this._msgTimeOut = 0;
        this._reconnetTimeOut = 0;

        this._closeWs();

        this._heartSendTimer = null;
        this._reconnectTimer = null;
        this._msgTimerOut = null;
        this._heartTimerOut = null;

        this._errorSendFn = null;
        this._msgTimeOutFn = null;
        this._reconnectEndFn = null;
        this._hearDataFn = null;
        this._onMessage = null;
        this._onConnected = null;
        this._onError = null;
        this._onClosed = null;

        this._op = null;
        this._ws = null;
    }

    public sendWs(data: socketData) {
        if (this._ws && this._ws.readyState == WebSocket.OPEN) {
            this._resetMsgTimerOut();
            this._ws.send(data);
        } else {
            this._errorSendFn && this._errorSendFn(this._ws ? this._ws.readyState : -1);
        }
    }

}

export const createWs = (channelId: number, op: socketOp, fn: socketFn) => {
    let bs: baseWs = socket[channelId];
    if (bs) bs.remove();
    bs = socket[channelId] = new baseWs();
    bs.createWs(op, fn);
}

export const removeWs = (channelId: number) => {
    let bs: baseWs = socket[channelId];
    if (!bs) return;
    bs.remove();
    delete socket[channelId];
}

export const sendWs = (channelId: number, data: socketData) => {
    let bs: baseWs = socket[channelId];
    if (!bs) return;
    bs.sendWs(data);
}

