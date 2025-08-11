/*
VoiceAgent TypeScript SDK - initial implementation.
Supports core call control (start, stop, mute) and event handling as per README.md
*/
import { WebsocketHandler } from './websocket_handler.js';
export class VoiceAgent {
    constructor(apiKey, baseUrl) {
        this.websocketHandler = null;
        this.listeners = new Map();
        this.muted = false;
        this.assistantSpeaking = false;
        this.OUTPUT_SAMPLE_RATE = 24000; // TTS sample rate
        this.INPUT_SAMPLE_RATE = 16000; // Microphone sample rate
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }
    /* --------------------------- Public API --------------------------- */
    /**
     * Starts a voice session – sets up microphone, websocket connection and audio playback.
     */
    async start(opts = {}) {
        if (this.websocketHandler)
            return; // already running
        this.params = opts;
        await this.setupOutput();
        await this.setupMicrophone();
        const wsCallbacks = {
            onmessage: (raw) => this.handleWsMessage(raw),
            onerror: (err) => {
                this.dispatch('error', err);
            },
            onclose: () => {
                this.dispatch('call-end');
            }
        };
        this.websocketHandler = new WebsocketHandler(this.apiKey, this.baseUrl, this.params, wsCallbacks);
    }
    stop() {
        var _a;
        this.teardownMicrophone();
        (_a = this.websocketHandler) === null || _a === void 0 ? void 0 : _a.close();
        this.teardownOutput();
        // reset states.
        if (this.assistantSpeaking) {
            this.assistantSpeaking = false;
        }
    }
    isMuted() {
        return this.muted;
    }
    setMuted(val) {
        var _a, _b;
        // If state unchanged: nothing to do
        if (this.muted === val)
            return;
        this.muted = val;
        if (val) {
            (_a = this.inputCtx) === null || _a === void 0 ? void 0 : _a.suspend().catch(() => { });
        }
        else {
            (_b = this.inputCtx) === null || _b === void 0 ? void 0 : _b.resume().catch(() => { });
        }
    }
    say(text, interruptAssistant = false, endCallAfterSpoken = false) {
        var _a;
        (_a = this.websocketHandler) === null || _a === void 0 ? void 0 : _a.sendSpeakMessage(text, interruptAssistant, endCallAfterSpoken);
    }
    /** Register event listener */
    on(evt, cb) {
        if (!this.listeners.has(evt))
            this.listeners.set(evt, new Set());
        this.listeners.get(evt).add(cb);
    }
    /** Remove event listener */
    off(evt, cb) {
        var _a;
        (_a = this.listeners.get(evt)) === null || _a === void 0 ? void 0 : _a.delete(cb);
    }
    /* ----------------------- Internal helpers ------------------------ */
    // TODO(gautijha37): can probably use EventEmitter from node:events
    dispatch(evt, payload) {
        var _a;
        (_a = this.listeners.get(evt)) === null || _a === void 0 ? void 0 : _a.forEach((cb) => {
            try {
                cb(payload);
            }
            catch (e) {
                console.error(`VoiceAgent listener for ${evt} threw`, e);
            }
        });
    }
    async setupMicrophone() {
        if (this.mediaStream)
            return;
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.inputCtx = new AudioContext({ sampleRate: this.INPUT_SAMPLE_RATE });
            this.inputSource = this.inputCtx.createMediaStreamSource(this.mediaStream);
            // Load and create AudioWorklet for microphone capture
            // import.meta.url is the path to the current module
            await this.inputCtx.audioWorklet.addModule(new URL('./input_audio_processor.js', import.meta.url).toString());
            this.inputProcessor = new AudioWorkletNode(this.inputCtx, 'input-audio-processor');
            this.inputProcessor.port.onmessage = (event) => {
                var _a;
                (_a = this.websocketHandler) === null || _a === void 0 ? void 0 : _a.sendUserAudio(event.data);
            };
            this.inputSource.connect(this.inputProcessor);
            this.inputProcessor.connect(this.inputCtx.destination);
        }
        catch (err) {
            console.error('Microphone setup error:', err);
            this.dispatch('error', err);
            throw err;
        }
    }
    teardownMicrophone() {
        var _a, _b;
        // Stop microphone hardware.
        (_a = this.mediaStream) === null || _a === void 0 ? void 0 : _a.getTracks().forEach((t) => t.stop());
        this.mediaStream = undefined;
        // Closing the AudioContext automatically disconnects any connected nodes.
        (_b = this.inputCtx) === null || _b === void 0 ? void 0 : _b.close();
        this.inputCtx = undefined;
        // Clear references so they can be garbage-collected.
        this.inputProcessor = undefined;
        this.inputSource = undefined;
    }
    async setupOutput() {
        if (this.outputCtx)
            return;
        this.outputCtx = new AudioContext({ sampleRate: this.OUTPUT_SAMPLE_RATE });
        try {
            await this.outputCtx.audioWorklet.addModule(new URL('./pcm_player_worklet.js', import.meta.url).toString());
            this.outputNode = new AudioWorkletNode(this.outputCtx, 'pcm-player');
            // Listen for playback completion events from the AudioWorklet.
            this.outputNode.port.onmessage = ({ data }) => {
                if (data.done && this.assistantSpeaking) {
                    this.assistantSpeaking = false;
                    this.dispatch('speech-end');
                }
            };
            this.outputNode.connect(this.outputCtx.destination);
        }
        catch (err) {
            console.warn('Failed to load pcm_player_worklet.js:', err);
            this.outputNode = undefined;
        }
        await this.outputCtx.resume().catch(() => { });
    }
    playAssistantPcm(int16) {
        var _a;
        (_a = this.outputNode) === null || _a === void 0 ? void 0 : _a.port.postMessage({ pcm: int16 }, [int16.buffer]);
    }
    clearAssistantAudio() {
        var _a;
        (_a = this.outputNode) === null || _a === void 0 ? void 0 : _a.port.postMessage({ reset: true });
    }
    handleWsMessage(raw) {
        let data;
        try {
            data = JSON.parse(raw);
        }
        catch (e) {
            console.warn('Invalid WS data', raw);
            return;
        }
        switch (data.type) {
            case 'call_start': {
                this.dispatch('call-start');
                this.dispatch('message', data);
                break;
            }
            case 'audio_bytes': {
                if (data.role !== 'assistant')
                    return;
                const audioBytes = Uint8Array.from(atob(data.audio_bytes), (c) => c.charCodeAt(0));
                const int16 = new Int16Array(audioBytes.buffer);
                if (!this.assistantSpeaking) {
                    this.assistantSpeaking = true;
                    this.dispatch('speech-start');
                }
                this.playAssistantPcm(int16);
                break;
            }
            case 'speech_start': {
                if (data.role == 'user') {
                    this.clearAssistantAudio();
                }
                break;
            }
            case 'error': {
                this.dispatch('error', new Error(data.message || 'Unknown error'));
                break;
            }
            default: // This is currently hit only for data.type='transcript'.
                // Forward other messages
                this.dispatch('message', data);
        }
    }
    /** Clean up audio output resources */
    teardownOutput() {
        var _a;
        (_a = this.outputCtx) === null || _a === void 0 ? void 0 : _a.close();
        this.outputCtx = undefined;
        this.outputNode = undefined;
    }
}
