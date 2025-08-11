export type LlmParams = {
    model: string;
    max_output_tokens: number;
    system_prompt: string;
    temperature: number;
    top_p: number;
};
export type TtsParams = {
    max_output_tokens: number;
    voice_name: string;
};
export type VadParams = {
    threshold: number;
    min_silence_duration_ms: number;
    speech_pad_ms: number;
};
export type AgentParams = {
    llm: LlmParams;
    tts: TtsParams;
    vad: VadParams;
};
export type StartOptions = {
    params?: Partial<AgentParams>;
};
