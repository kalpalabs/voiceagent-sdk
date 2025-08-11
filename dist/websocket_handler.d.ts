import { StartOptions } from './messages.js';
export interface WSCallbacks {
    onopen?: () => void;
    onmessage?: (raw: string) => void;
    onerror?: (err: Event | Error) => void;
    onclose?: (ev: CloseEvent) => void;
}
export declare class WebsocketHandler {
    private cbs;
    private ws;
    private apiKey;
    private params?;
    private baseUrl?;
    constructor(apiKey: string, baseUrl?: string, params?: StartOptions, cbs?: WSCallbacks);
    private buildWsUrl;
    close(): void;
    private sendInitialize;
    sendUserAudio(buffer: ArrayBufferLike): void;
    sendSpeakMessage(text: string, interruptAssistant: boolean, endCallAfterSpoken: boolean): void;
}
