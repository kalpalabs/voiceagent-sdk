import { arrayBufferToBase64 } from './utils.js';
export class WebsocketHandler {
    constructor(apiKey, baseUrl, params, cbs = {}) {
        this.cbs = cbs;
        this.ws = null;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.params = params;
        this.ws = new WebSocket(this.buildWsUrl());
        /* wire up events */
        this.ws.onopen = () => {
            var _a, _b;
            this.sendInitialize();
            (_b = (_a = this.cbs).onopen) === null || _b === void 0 ? void 0 : _b.call(_a);
        };
        this.ws.onmessage = (ev) => { var _a, _b; return (_b = (_a = this.cbs).onmessage) === null || _b === void 0 ? void 0 : _b.call(_a, ev.data); };
        this.ws.onerror = (err) => { var _a, _b; return (_b = (_a = this.cbs).onerror) === null || _b === void 0 ? void 0 : _b.call(_a, err); };
        this.ws.onclose = (ev) => { var _a, _b; return (_b = (_a = this.cbs).onclose) === null || _b === void 0 ? void 0 : _b.call(_a, ev); };
    }
    buildWsUrl() {
        var _a, _b;
        const envBaseUrl = ((_b = (_a = globalThis === null || globalThis === void 0 ? void 0 : globalThis.process) === null || _a === void 0 ? void 0 : _a.env) === null || _b === void 0 ? void 0 : _b.KALPA_BASE_URL) || undefined;
        const baseUrl = this.baseUrl || envBaseUrl || 'https://api.kalpalabs.ai';
        const protocol = baseUrl.startsWith('https://') ? 'wss:' : 'ws:';
        // Strip http(s) scheme if present to form host for ws url
        const host = baseUrl.replace(/^https?:\/\//, '');
        return `${protocol}//${host}/ws/speech?token=${this.apiKey}`;
    }
    close() {
        var _a;
        (_a = this.ws) === null || _a === void 0 ? void 0 : _a.close();
    }
    sendInitialize() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        this.ws.send(JSON.stringify({
            type: 'initialize',
            params: this.params,
        }));
    }
    sendUserAudio(buffer) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        this.ws.send(JSON.stringify({
            type: 'audio_bytes',
            role: 'user',
            audio_bytes: arrayBufferToBase64(buffer),
        }));
    }
    sendSpeakMessage(text, interruptAssistant, endCallAfterSpoken) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        this.ws.send(JSON.stringify({
            type: 'speak',
            text: text,
            interrupt_assistant: interruptAssistant,
            end_call_after_spoken: endCallAfterSpoken,
        }));
    }
}
