/*
VoiceAgent TypeScript SDK - initial implementation.
Supports core call control (start, stop, mute) and event handling as per README.md
*/

import { StartOptions } from './messages.js';
import { WSCallbacks, WebsocketHandler } from './websocket_handler.js';

export type MessagePayload = any; // Forward raw backend messages for now

export type VoiceAgentEventMap = {
    'speech-start': void;
    'speech-end': void;
    'call-start': void;
    'call-end': void;
    'message': MessagePayload;
    'error': Error | Event;
};

type EventKeys = keyof VoiceAgentEventMap;

export class VoiceAgent {
    private readonly apiKey: string;
    private websocketHandler: WebsocketHandler | null = null;
    private baseUrl?: string;
    private readonly listeners: Map<EventKeys, Set<(payload: any) => void>> = new Map();

    private inputCtx?: AudioContext;
    private inputProcessor?: AudioWorkletNode;
    private inputSource?: MediaStreamAudioSourceNode;
    private mediaStream?: MediaStream;

    // The `outputCtx` is the browser's audio engine, responsible for all sound playback.
    // `outputNode` is a custom audio player we plug into this engine. It feeds raw pcm bytes to
    // the outputCtx which the browser then plays in a separate thread without freezing UI.
    private outputCtx?: AudioContext;
    private outputNode?: AudioWorkletNode;

    private params?: StartOptions;

    private muted = false;
    private assistantSpeaking = false;

    private readonly OUTPUT_SAMPLE_RATE = 24000; // TTS sample rate
    private readonly INPUT_SAMPLE_RATE = 16000; // Microphone sample rate

    constructor(apiKey: string, baseUrl?: string) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    /* --------------------------- Public API --------------------------- */

    /**
     * Starts a voice session – sets up microphone, websocket connection and audio playback.
     */
    async start(opts: StartOptions = {}): Promise<void> {
        if (this.websocketHandler) return; // already running

        this.params = opts;

        await this.setupOutput();
        await this.setupMicrophone();

        const wsCallbacks: WSCallbacks = {
            onmessage: (raw: string) => this.handleWsMessage(raw),
            onerror: (err: Event | Error) => {
                this.dispatch('error', err);
            },
            onclose: () => {
                this.dispatch('call-end');
            }
        };

        this.websocketHandler = new WebsocketHandler(this.apiKey, this.baseUrl, this.params, wsCallbacks);
    }


    stop() {
        this.teardownMicrophone();

        this.websocketHandler?.close();

        this.teardownOutput();

        // reset states.
        if (this.assistantSpeaking) {
            this.assistantSpeaking = false;
        }
    }

    isMuted() {
        return this.muted;
    }

    setMuted(val: boolean) {
        // If state unchanged: nothing to do
        if (this.muted === val) return;

        this.muted = val;

        if (val) {
            this.inputCtx?.suspend().catch(() => {});
        } else {
            this.inputCtx?.resume().catch(() => {});
        }
    }

    say(text: string, interruptAssistant: boolean = false, endCallAfterSpoken: boolean = false) {
        this.websocketHandler?.sendSpeakMessage(text, interruptAssistant, endCallAfterSpoken);
    }

    /** Register event listener */
    on<K extends EventKeys>(evt: K, cb: (payload: VoiceAgentEventMap[K]) => void) {
        if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
        this.listeners.get(evt)!.add(cb);
    }

    /** Remove event listener */
    off<K extends EventKeys>(evt: K, cb: (payload: VoiceAgentEventMap[K]) => void) {
        this.listeners.get(evt)?.delete(cb);
    }

    /* ----------------------- Internal helpers ------------------------ */
    // TODO(gautijha37): can probably use EventEmitter from node:events
    private dispatch<K extends EventKeys>(evt: K, payload?: VoiceAgentEventMap[K]) {
        this.listeners.get(evt)?.forEach((cb) => {
            try {
                cb(payload);
            } catch (e) {
                console.error(`VoiceAgent listener for ${evt} threw`, e);
            }
        });
    }

    private async setupMicrophone() {
        if (this.mediaStream) return;
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            this.inputCtx = new AudioContext({ sampleRate: this.INPUT_SAMPLE_RATE });
            this.inputSource = this.inputCtx.createMediaStreamSource(this.mediaStream);

            // Load and create AudioWorklet for microphone capture
            // import.meta.url is the path to the current module
            await this.inputCtx.audioWorklet.addModule(new URL('./input_audio_processor.js', import.meta.url).toString());

            this.inputProcessor = new AudioWorkletNode(this.inputCtx, 'input-audio-processor');
            this.inputProcessor.port.onmessage = (event) => {
                this.websocketHandler?.sendUserAudio(event.data as ArrayBuffer);
            };

            this.inputSource.connect(this.inputProcessor);
            this.inputProcessor.connect(this.inputCtx.destination);
        } catch (err) {
            console.error('Microphone setup error:', err);
            this.dispatch('error', err as any);
            throw err;
        }
    }

    private teardownMicrophone() {
        // Stop microphone hardware.
        this.mediaStream?.getTracks().forEach((t) => t.stop());
        this.mediaStream = undefined;

        // Closing the AudioContext automatically disconnects any connected nodes.
        this.inputCtx?.close();
        this.inputCtx = undefined;

        // Clear references so they can be garbage-collected.
        this.inputProcessor = undefined;
        this.inputSource = undefined;
    }

    private async setupOutput() {
        if (this.outputCtx) return;
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
        } catch (err) {
            console.warn('Failed to load pcm_player_worklet.js:', err);
            this.outputNode = undefined;
        }

        await this.outputCtx.resume().catch(() => {});
    }

    private playAssistantPcm(int16: Int16Array) {
        this.outputNode?.port.postMessage({ pcm: int16 }, [int16.buffer]);
    }

    private clearAssistantAudio() {
        this.outputNode?.port.postMessage({ reset: true });
    }

    private handleWsMessage(raw: string) {
        let data: any;
        try {
            data = JSON.parse(raw);
        } catch (e) {
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
                if (data.role !== 'assistant') return;
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
                if(data.role == 'user'){
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
    private teardownOutput() {
        this.outputCtx?.close();
        this.outputCtx = undefined;
        this.outputNode = undefined;
    }
} 