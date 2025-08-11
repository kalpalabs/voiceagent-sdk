import { StartOptions } from './messages.js';
export type MessagePayload = any;
export type VoiceAgentEventMap = {
    'speech-start': void;
    'speech-end': void;
    'call-start': void;
    'call-end': void;
    'message': MessagePayload;
    'error': Error | Event;
};
type EventKeys = keyof VoiceAgentEventMap;
export declare class VoiceAgent {
    private readonly apiKey;
    private websocketHandler;
    private baseUrl?;
    private readonly listeners;
    private inputCtx?;
    private inputProcessor?;
    private inputSource?;
    private mediaStream?;
    private outputCtx?;
    private outputNode?;
    private params?;
    private muted;
    private assistantSpeaking;
    private readonly OUTPUT_SAMPLE_RATE;
    private readonly INPUT_SAMPLE_RATE;
    constructor(apiKey: string, baseUrl?: string);
    /**
     * Starts a voice session – sets up microphone, websocket connection and audio playback.
     */
    start(opts?: StartOptions): Promise<void>;
    stop(): void;
    isMuted(): boolean;
    setMuted(val: boolean): void;
    say(text: string, interruptAssistant?: boolean, endCallAfterSpoken?: boolean): void;
    /** Register event listener */
    on<K extends EventKeys>(evt: K, cb: (payload: VoiceAgentEventMap[K]) => void): void;
    /** Remove event listener */
    off<K extends EventKeys>(evt: K, cb: (payload: VoiceAgentEventMap[K]) => void): void;
    private dispatch;
    private setupMicrophone;
    private teardownMicrophone;
    private setupOutput;
    private playAssistantPcm;
    private clearAssistantAudio;
    private handleWsMessage;
    /** Clean up audio output resources */
    private teardownOutput;
}
export {};
