# Kalpalabs VoiceAgent typescript sdk

## Installation
```shell
npm i @kalpalabs/voiceagent-sdk
```

## Call control
```jsx
import { VoiceAgent } from '@kalpalabs/voiceagent-sdk';

const agent = new VoiceAgent('<client-api-key>');

// Automatically connects your microphone and audio output
// in the browser via websockets.
// Provide parameters that you want to override for this call
// rest of the parameters will be taken from default `Agent Parameters` section below
await agent.start({
    "llm": {
        "model": "llama-3.1-8b",
        "system_prompt": "You are a helpful agent",
    },
    "tts": {
        "voice_name": "dan"
    },
});

// mute and unmute user's microphone
agent.isMuted(); // false
agent.setMuted(true);
agent.isMuted(); // true

// say(message: string, endCallAfterSpoken?: boolean) can be used to invoke speech and gracefully terminate the call if needed
agent.say("Our time's up, goodbye!", true);

// stop session
agent.stop();
```

### Agent parameters
Full list of supported params and their default values:
```json
"params": {
    "llm": {
      "model": "llama-3.3-70b",
      "max_output_tokens": 512,
      "system_prompt": "You are a helpful agent",
      "temperature": 0.5,
      "top_p": 0.9,
    },
    "tts": {
      "max_output_tokens": 2048,
      "voice_name": "tara"
    },
    "vad": {
      "threshold": 0.6,
      "min_silence_duration_ms": 500,
      "speech_pad_ms": 500
    }
}
```
currently we only support `openai/whisper-large-v3-turbo` for STT and `canopylabs/orpheus-tts-0.1-finetune-prod` for TTS. 

For LLM we support one of the following options:
`"llama-3.1-8b", "llama-3.3-70b", "qwen-3-32b", "llama-4-scout-17b-16e-instruct", "llama-4-maverick-17b-128e-instruct"` 

For TTS, voice_name can take one of the following options:
`"tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"`


## Events
You can listen to the following events that `agent` emits and perform custom actions on them:
```jsx
agent.on('speech-start', () => {
  console.log('Assistant speech has started');
});

agent.on('speech-end', () => {
  console.log('Assistant speech has ended');
});

agent.on('call-start', () => {
  console.log('Call has started');
});

agent.on('call-end', () => {
  console.log('Call has stopped');
});

// Function calls and transcripts will be sent via messages
agent.on('message', (message) => {
  console.log(message);
});

agent.on('error', (e) => {
  console.error(e);
});
```

## Full list of Kalpalabs -> Client messages
These are the additional messages that you can handle in your code within `agent.on('message')` event:

1. Call start message contains the conversation_id of the current call:
```json
{
  "type": "call_start",
  "conversation_id": "<conversation_id>"
}
```
2. Transcript message (both user and assistant):
```json
{
  "type": "transcript",
  "transcript": "<transcript>",
  "role": "user|assistant",
}
```
3. Transcript update message (assistant partial transcript):
```json
{
  "type": "transcript_update",
  "transcript": "<partial_transcript>",
  "role": "assistant",
  "request_id": "<request_id>"
}
```
4. Speech start message:
```json
{
  "type": "speech_start",
  "role": "user|assistant"
}
```
6. Response finished message when current "turn" of assistant speaking is finished:
```json
{
  "type": "response_finished"
}
```
7. Latency message - TTFB latency (in ms) of the current "turn" of conversation:
```json
{
  "type": "latency",
  "latency": 500
}
```
8. Error message:
```json
{
  "type": "error",
  "message": "<error_message>"
}
```
9. Disconnect message - Server is now going to disconnect the websocket:
```json
{
  "type": "disconnect",
  "reason": "<disconnection_reason>"
}
```
