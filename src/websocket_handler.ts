import { StartOptions } from './messages.js';
import { arrayBufferToBase64 } from './utils.js';

export interface WSCallbacks {
    onopen?: () => void;
    onmessage?: (raw: string) => void;
    onerror?: (err: Event | Error) => void;
    onclose?: (ev: CloseEvent) => void;
}

export class WebsocketHandler {
    private ws: WebSocket | null = null;
    private apiKey: string;
    private params?: StartOptions;
    private baseUrl?: string;

    constructor(apiKey: string, baseUrl?: string, params?: StartOptions, private cbs: WSCallbacks = {}) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.params = params;

        this.ws = new WebSocket(this.buildWsUrl());

        /* wire up events */
        this.ws.onopen = () => {
            this.sendInitialize();
            this.cbs.onopen?.();
        };
        this.ws.onmessage = (ev)         => this.cbs.onmessage?.(ev.data as string);
        this.ws.onerror   = (err)        => this.cbs.onerror?.(err);
        this.ws.onclose   = (ev)         => this.cbs.onclose?.(ev);
    }

    private buildWsUrl(): string {
        const envBaseUrl = (globalThis as any)?.process?.env?.KALPA_BASE_URL || undefined;
        const baseUrl = this.baseUrl || envBaseUrl || 'https://api.kalpalabs.ai';
        const protocol = baseUrl.startsWith('https://') ? 'wss:' : 'ws:';

        // Strip http(s) scheme if present to form host for ws url
        const host = baseUrl.replace(/^https?:\/\//, '');
        return `${protocol}//${host}/ws/speech?token=${this.apiKey}`;
    }

    close() {
        this.ws?.close();
    }

    private sendInitialize() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(
            JSON.stringify({
                type: 'initialize',
                params: this.params,
            }),
        );
    }

    sendUserAudio(buffer: ArrayBufferLike) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(
            JSON.stringify({
                type: 'audio_bytes',
                role: 'user',
                audio_bytes: arrayBufferToBase64(buffer),
            }),
        );
    }

    sendSpeakMessage(text: string, interruptAssistant: boolean, endCallAfterSpoken: boolean) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(
            JSON.stringify({
                type: 'speak',
                text: text,
                interrupt_assistant: interruptAssistant,
                end_call_after_spoken: endCallAfterSpoken,
            }),
        );
    }
}